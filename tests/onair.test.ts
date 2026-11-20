import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { clearAccessStateForTests, decodeJwt, loadRoster, teamIssuer } from "@/lib/onair/access";
import * as onair from "@/lib/onair/handlers";
import { parseHealth, readOnairStatus } from "@/lib/onair/status";
import { findStartScript, resetStartLimitForTests, scriptCandidates, type StartDeps } from "@/lib/onair/start";
import { onairViewer } from "@/lib/onair/viewer";
import { clearAuthCache } from "@/lib/wiki/auth";
import * as h from "@/lib/wiki/handlers";
import { bodyOf, makeSandbox, mockOnair, req, type FetchMock, type Sandbox } from "./helpers";

const ORIGIN = { origin: "http://wiki.test", host: "wiki.test" };
const SCRIPT = "C:\\Users\\onair\\Desktop\\ONAIR 시작.cmd";

/** 포트 흉내: 켜진 포트 목록 */
function ports(up: number[], health: unknown = { status: "healthy", version: "x" }) {
  return {
    probePort: async (p: number) => up.includes(p),
    fetchHealth: async () => (up.includes(8000) ? health : null),
  };
}

function deps(over: Partial<StartDeps> & { up?: number[] } = {}): StartDeps & { launched: string[] } {
  const launched: string[] = [];
  const { up = [3000], ...rest } = over;
  return {
    platform: "win32",
    ...ports(up),
    findScript: async () => SCRIPT,
    launch: async (p: string) => {
      launched.push(p);
    },
    ...rest,
    launched,
  };
}

let sb: Sandbox;
let mock: FetchMock;
beforeEach(() => {
  sb = makeSandbox({ ONAIR_API_BASE: "http://onair.test" });
  mock = mockOnair();
  clearAccessStateForTests();
  resetStartLimitForTests();
});
afterEach(() => {
  mock.restore();
  clearAccessStateForTests();
  resetStartLimitForTests();
  delete process.env.OFFAIR_ACCESS_TEAM;
  delete process.env.OFFAIR_ACCESS_AUD;
  delete process.env.OFFAIR_ONAIR_START_GAP_MS;
  sb.cleanup();
});

describe("상태 읽기", () => {
  test("health 본문 해석", () => {
    assert.equal(parseHealth({ status: "healthy", uptime: 3 }), "healthy");
    assert.equal(parseHealth({ status: "degraded" }), "unhealthy");
    assert.equal(parseHealth({ status: 500 }), "unhealthy");
    assert.equal(parseHealth("ok"), "unhealthy");
    assert.equal(parseHealth(null), "no_answer");
  });

  test("세 포트와 서버 health", async () => {
    const s = await readOnairStatus({ ...ports([8000, 3001]), now: () => Date.UTC(2026, 10, 20, 1, 2, 3) });
    assert.deepEqual(
      s.apps.map((a) => [a.id, a.name, a.port, a.up]),
      [
        ["server", "서버", 8000, true],
        ["display", "송출 화면", 3000, false],
        ["control", "컨트롤", 3001, true],
      ]
    );
    assert.equal(s.apps[0].health, "healthy");
    assert.equal(s.apps[1].health, undefined);
    assert.equal(s.allUp, false);
    assert.equal(s.allDown, false);
    assert.equal(s.checkedAt, "2026-11-20T01:02:03.000Z");
  });

  test("서버 포트가 닫혀 있으면 health 는 응답 없음, 포트 검사 오류는 꺼짐", async () => {
    const s = await readOnairStatus({
      probePort: async (p) => {
        if (p === 3000) throw new Error("boom");
        return false;
      },
      fetchHealth: async () => ({ status: "healthy" }),
    });
    assert.equal(s.apps[0].health, "no_answer");
    assert.equal(s.allDown, true);
  });

  test("열린 포트에 실제로 붙어 본다", async () => {
    const net = await import("node:net");
    const { probePort } = await import("@/lib/onair/status");
    const srv = net.createServer().listen(0, "127.0.0.1");
    await new Promise((r) => srv.once("listening", r));
    const port = (srv.address() as { port: number }).port;
    try {
      assert.equal(await probePort(port), true);
    } finally {
      await new Promise((r) => srv.close(r));
    }
    assert.equal(await probePort(port), false);
  });
});

describe("GET /api/onair/status 권한", () => {
  test("로그인 안 함 401, 미등록·교사·졸업생 403, 부원 200 (켜기 불가), 부장 200 (켜기 가능)", async () => {
    const d = deps({ up: [8000, 3000, 3001] });
    assert.equal((await onair.status(req("GET", "/api/onair/status"), d)).status, 401);
    assert.equal((await onair.status(req("GET", "/api/onair/status", { token: "tok-guest" }), d)).status, 403);
    assert.equal((await onair.status(req("GET", "/api/onair/status", { token: "tok-teacher" }), d)).status, 403);
    assert.equal((await onair.status(req("GET", "/api/onair/status", { token: "tok-alumni" }), d)).status, 403);
    const m = await onair.status(req("GET", "/api/onair/status", { token: "tok-member" }), d);
    assert.equal(m.status, 200);
    const mb = await bodyOf(m);
    assert.equal(mb.canStart, false);
    assert.equal(mb.allUp, true);
    assert.equal(mb.startSupported, true);
    assert.equal(mb.identity, "onair");
    const l = await bodyOf(await onair.status(req("GET", "/api/onair/status", { token: "tok-lead" }), d));
    assert.equal(l.canStart, true);
    const sa = await bodyOf(await onair.status(req("GET", "/api/onair/status", { token: "tok-superadmin" }), d));
    assert.equal(sa.canStart, true);
  });

  test("/api/me 에 ONAIR 메뉴 권한", async () => {
    const m = await bodyOf(await h.me(req("GET", "/api/me", { token: "tok-member" })));
    assert.deepEqual(m.onair, { canView: true, canStart: false });
    const l = await bodyOf(await h.me(req("GET", "/api/me", { token: "tok-lead" })));
    assert.deepEqual(l.onair, { canView: true, canStart: true });
    const g = await bodyOf(await h.me(req("GET", "/api/me")));
    assert.deepEqual(g.onair, { canView: false, canStart: false });
  });
});

describe("POST /api/onair/start", () => {
  const post = (token?: string, headers: Record<string, string> = ORIGIN) => req("POST", "/api/onair/start", { token, headers });

  test("로그인 안 함 401, 부원 403, 다른 사이트 403, Origin 없음 403", async () => {
    const d = deps();
    assert.equal((await onair.start(post(undefined), d)).status, 401);
    assert.equal((await onair.start(post("tok-member"), d)).status, 403);
    assert.equal((await onair.start(post("tok-alumni"), d)).status, 403);
    assert.equal((await onair.start(post("tok-lead", { origin: "https://evil.test", host: "wiki.test" }), d)).status, 403);
    assert.equal((await onair.start(post("tok-lead", { ...ORIGIN, "sec-fetch-site": "cross-site" }), d)).status, 403);
    assert.equal((await onair.start(post("tok-lead", {}), d)).status, 403);
    assert.deepEqual(d.launched, []);
  });

  test("부장이 누르면 바탕화면 스크립트를 실행하고 꺼진 부분을 알려 준다", async () => {
    const d = deps({ up: [3000] });
    const res = await onair.start(post("tok-lead", { ...ORIGIN, "sec-fetch-site": "same-origin" }), d);
    assert.equal(res.status, 202);
    const b = await bodyOf(res);
    assert.deepEqual(b.launched, { script: SCRIPT, via: "explorer.exe" });
    assert.deepEqual(b.starting, ["서버", "컨트롤"]);
    assert.deepEqual(d.launched, [SCRIPT]);
    const log = fs.readFileSync(path.join(sb.data, "logs", "onair-start.log"), "utf8");
    assert.match(log, /부장\(m-lead, lead\) 실행: .*ONAIR 시작\.cmd — 켤 것: 서버, 컨트롤/);
  });

  test("Windows 가 아니면 501", async () => {
    const d = deps({ platform: "darwin" });
    const res = await onair.start(post("tok-superadmin"), d);
    assert.equal(res.status, 501);
    assert.equal((await bodyOf(res)).error, "not_windows");
    assert.deepEqual(d.launched, []);
  });

  test("셋 다 켜져 있으면 409 '이미 다 켜져 있어요'", async () => {
    const d = deps({ up: [8000, 3000, 3001] });
    const res = await onair.start(post("tok-lead"), d);
    assert.equal(res.status, 409);
    const b = await bodyOf(res);
    assert.equal(b.error, "already_up");
    assert.equal(b.message, "이미 다 켜져 있어요.");
    assert.deepEqual(d.launched, []);
  });

  test("60초에 한 번만 — 다음 누름은 429, 시간이 지나면 다시 된다", async () => {
    let t = 1_000_000;
    const d = deps({ now: () => t });
    assert.equal((await onair.start(post("tok-lead"), d)).status, 202);
    t += 30_000;
    const again = await onair.start(post("tok-superadmin"), d);
    assert.equal(again.status, 429);
    const b = await bodyOf(again);
    assert.equal(b.error, "too_soon");
    assert.equal(b.retryAfter, 30);
    t += 30_000;
    assert.equal((await onair.start(post("tok-lead"), d)).status, 202);
    assert.equal(d.launched.length, 2);
  });

  test("동시에 두 번 눌러도 한 번만 실행", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const d = deps({
      probePort: async (p: number) => {
        await gate;
        return p === 3000;
      },
    });
    const first = onair.start(post("tok-lead"), d);
    const second = await onair.start(post("tok-lead"), d);
    release();
    assert.equal((await first).status, 202);
    assert.equal(second.status, 429);
    assert.equal(d.launched.length, 1);
  });

  test("스크립트를 못 찾으면 503, 실행이 실패하면 500 이고 제한에 걸리지 않는다", async () => {
    const none = deps({ findScript: async () => null });
    const nr = await onair.start(post("tok-lead"), none);
    assert.equal(nr.status, 503, JSON.stringify(await bodyOf(nr.clone())));
    const broken = deps({
      launch: async () => {
        throw new Error("ENOENT");
      },
    });
    const r = await onair.start(post("tok-lead"), broken);
    assert.equal(r.status, 500);
    assert.equal((await bodyOf(r)).error, "launch_failed");
    const ok = deps();
    assert.equal((await onair.start(post("tok-lead"), ok)).status, 202);
  });
});

describe("ONAIR 시작.cmd 찾기", () => {
  test("PowerShell 이 알려 준 바탕화면(OneDrive 포함)이 먼저, 그다음 USERPROFILE\\Desktop", () => {
    const env = { USERPROFILE: "C:\\Users\\onair" };
    assert.deepEqual(scriptCandidates("C:\\Users\\onair\\OneDrive\\바탕 화면", env), [
      "C:\\Users\\onair\\OneDrive\\바탕 화면\\ONAIR 시작.cmd",
      "C:\\Users\\onair\\Desktop\\ONAIR 시작.cmd",
      "C:\\Users\\onair\\OneDrive\\Desktop\\ONAIR 시작.cmd",
    ]);
    assert.equal(scriptCandidates(null, { ONAIR_START_SCRIPT: "D:\\x\\ONAIR 시작.cmd", USERPROFILE: "C:\\U" }).length, 1);
  });

  test("있는 파일 중 첫 번째", async () => {
    const env = { USERPROFILE: "C:\\Users\\onair" };
    const found = await findStartScript(
      async () => "C:\\Users\\onair\\OneDrive\\바탕 화면",
      (p) => p === "C:\\Users\\onair\\Desktop\\ONAIR 시작.cmd",
      env
    );
    assert.equal(found, "C:\\Users\\onair\\Desktop\\ONAIR 시작.cmd");
    assert.equal(await findStartScript(async () => null, () => false, env), null);
  });
});

/* ───────────── ONAIR 가 꺼졌을 때: Access 토큰 직접 확인 ───────────── */

const ISS = "https://bssmcast.cloudflareaccess.com";
const AUD = "aud-wiki-123";
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWK = { ...(publicKey.export({ format: "jwk" }) as Record<string, unknown>), kid: "k1", alg: "RS256", use: "sig" };

function jwt(claims: Record<string, unknown>, key: crypto.KeyObject = privateKey, kid = "k1"): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = enc({ alg: "RS256", kid, typ: "JWT" });
  const body = enc({ iss: ISS, aud: [AUD], iat: now, exp: now + 3600, sub: "s", ...claims });
  const sig = crypto.sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key).toString("base64url");
  return `${head}.${body}.${sig}`;
}

/** ONAIR(/api/members/me)와 Cloudflare certs 흉내. up=false 면 ONAIR 가 꺼진 것 */
function mockAccess(people: Record<string, { role: string; name: string; memberId: string }>) {
  const state = { up: true, certCalls: 0 };
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === `${ISS}/cdn-cgi/access/certs`) {
      state.certCalls++;
      return Response.json({ keys: [JWK] });
    }
    if (url.endsWith("/api/members/me")) {
      if (!state.up) throw new TypeError("fetch failed");
      const token = new Headers(init?.headers).get("cf-access-jwt-assertion") ?? "";
      const email = String(decodeJwt(token)?.payload.email ?? "").toLowerCase();
      const who = people[email];
      return Response.json(who ? { status: "approved", ...who } : { status: "unregistered", role: "guest", name: "", memberId: null });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { state, restore: () => (globalThis.fetch = original) };
}

describe("ONAIR 가 꺼졌을 때 신원 (최근 기록)", () => {
  const PEOPLE = {
    "lead@bssm.hs.kr": { role: "lead", name: "부장", memberId: "m-lead" },
    "mem@bssm.hs.kr": { role: "member", name: "김부원", memberId: "m-1" },
  };
  let acc: ReturnType<typeof mockAccess>;
  beforeEach(() => {
    mock.restore();
    acc = mockAccess(PEOPLE);
  });
  afterEach(() => acc.restore());

  test("ONAIR 가 확인해 준 부원을 기억하고, ONAIR 가 꺼지면 토큰을 직접 확인해 그 역할로 본다", async () => {
    const lead = jwt({ email: "Lead@bssm.hs.kr" });
    const up = await onairViewer(req("GET", "/onair", { token: lead }));
    assert.deepEqual([up.viewer.role, up.fallback], ["lead", false]);
    const roster = loadRoster();
    assert.equal(roster.issuer, ISS);
    assert.deepEqual(roster.audiences, [AUD]);
    assert.equal(roster.people["lead@bssm.hs.kr"].role, "lead");
    // 파일에도 남는다 (OFFAIR 를 다시 켜도 쓸 수 있게)
    const onDisk = JSON.parse(fs.readFileSync(path.join(sb.data, "onair-access.json"), "utf8"));
    assert.equal(onDisk.people["lead@bssm.hs.kr"].name, "부장");

    acc.state.up = false;
    clearAccessStateForTests(); // 메모리 캐시 없이 파일에서 다시 읽어도
    clearAuthCache();
    const down = await onairViewer(req("GET", "/onair", { headers: { cookie: `CF_Authorization=${lead}` } }));
    assert.deepEqual([down.viewer.role, down.viewer.name, down.viewer.source, down.fallback, down.onairDown], ["lead", "부장", "roster", true, true]);
    // 위키 권한(base)은 그대로 손님
    assert.equal(down.base.role, "guest");

    const d = deps();
    const st = await bodyOf(await onair.status(req("GET", "/api/onair/status", { token: lead }), d));
    assert.equal(st.identity, "recent");
    assert.equal(st.canStart, true);
    assert.equal((await onair.start(req("POST", "/api/onair/start", { token: lead, headers: ORIGIN }), d)).status, 202);
    const me = await bodyOf(await h.me(req("GET", "/api/me", { token: lead })));
    assert.equal(me.authenticated, false);
    assert.deepEqual(me.onair, { canView: true, canStart: true });
  });

  test("위조·만료·다른 AUD·명단에 없는 사람·너무 오래된 기록은 손님", async () => {
    await onairViewer(req("GET", "/", { token: jwt({ email: "lead@bssm.hs.kr" }) }));
    await onairViewer(req("GET", "/", { token: jwt({ email: "mem@bssm.hs.kr" }) }));
    acc.state.up = false;
    clearAuthCache();
    const now = Math.floor(Date.now() / 1000);
    const bad = {
      forged: jwt({ email: "lead@bssm.hs.kr" }, other.privateKey),
      expired: jwt({ email: "lead@bssm.hs.kr", exp: now - 120 }),
      otherAud: jwt({ email: "lead@bssm.hs.kr", aud: "someone-else" }),
      otherIss: jwt({ email: "lead@bssm.hs.kr", iss: "https://evil.cloudflareaccess.com" }),
      unknownKid: jwt({ email: "lead@bssm.hs.kr" }, privateKey, "k-other"),
      stranger: jwt({ email: "who@bssm.hs.kr" }),
      notJwt: "tok-lead",
    };
    for (const [why, token] of Object.entries(bad)) {
      const w = await onairViewer(req("GET", "/", { token }));
      assert.equal(w.viewer.role, "guest", why);
      assert.equal(w.fallback, false, why);
    }
    // 부원은 상태만, 켜기는 403
    const mem = jwt({ email: "mem@bssm.hs.kr" });
    assert.equal((await onair.status(req("GET", "/api/onair/status", { token: mem }), deps())).status, 200);
    assert.equal((await onair.start(req("POST", "/api/onair/start", { token: mem, headers: ORIGIN }), deps())).status, 403);

    // 기록이 30일보다 오래되면 쓰지 않는다
    const file = path.join(sb.data, "onair-access.json");
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    j.people["lead@bssm.hs.kr"].seenAt = Date.now() - 31 * 24 * 3600 * 1000;
    fs.writeFileSync(file, JSON.stringify(j));
    clearAccessStateForTests();
    assert.equal((await onairViewer(req("GET", "/", { token: jwt({ email: "lead@bssm.hs.kr" }) }))).viewer.role, "guest");
  });

  test("졸업생으로 바뀌면 명단에서 빠진다", async () => {
    const lead = jwt({ email: "lead@bssm.hs.kr" });
    await onairViewer(req("GET", "/", { token: lead }));
    assert.ok(loadRoster().people["lead@bssm.hs.kr"]);
    PEOPLE["lead@bssm.hs.kr"].role = "alumni";
    try {
      clearAuthCache();
      await onairViewer(req("GET", "/", { token: lead }));
      assert.equal(loadRoster().people["lead@bssm.hs.kr"], undefined);
    } finally {
      PEOPLE["lead@bssm.hs.kr"].role = "lead";
    }
  });

  test("ONAIR 가 켜져 있으면 손님 답을 그대로 따른다 (명단을 보지 않음)", async () => {
    const lead = jwt({ email: "lead@bssm.hs.kr" });
    await onairViewer(req("GET", "/", { token: lead }));
    const certs = acc.state.certCalls;
    const w = await onairViewer(req("GET", "/", { token: jwt({ email: "who@bssm.hs.kr" }) }));
    assert.equal(w.viewer.role, "guest");
    assert.equal(acc.state.certCalls, certs);
  });

  test("명단을 배우기 전에는 env 의 팀·AUD 로만 확인할 수 있고, 명단에 없으면 여전히 손님", async () => {
    acc.state.up = false;
    process.env.OFFAIR_ACCESS_TEAM = "bssmcast";
    process.env.OFFAIR_ACCESS_AUD = AUD;
    const w = await onairViewer(req("GET", "/", { token: jwt({ email: "lead@bssm.hs.kr" }) }));
    assert.equal(w.viewer.role, "guest");
    assert.equal(acc.state.certCalls, 1);
    assert.equal(teamIssuer("bssmcast"), ISS);
    assert.equal(teamIssuer("https://bssmcast.cloudflareaccess.com/"), ISS);
    assert.equal(teamIssuer("evil.example.com"), null);
  });

  test("ONAIR 가 꺼져 있고 모르는 사람이면 상태도 401", async () => {
    acc.state.up = false;
    const r = await onair.status(req("GET", "/api/onair/status", { token: jwt({ email: "lead@bssm.hs.kr" }) }), deps());
    assert.equal(r.status, 401);
  });
});
