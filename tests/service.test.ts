/**
 * CUE 연동 — 같은 PC 서비스의 읽기 전용 대리 접근, 문서 글(format=text), 검색 결과 모양.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import * as h from "@/lib/wiki/handlers";
import { PEER_HEADER, peerStamp } from "@/lib/wiki/peer";
import { bodyOf, doc, makeSandbox, mockOnair, req, type FetchMock, type Sandbox } from "./helpers";

let sb: Sandbox;
let onair: FetchMock;
const TOKEN = "svc-secret-0123456789";

beforeEach(() => {
  sb = makeSandbox({ ONAIR_API_BASE: "http://onair.test", OFFAIR_SERVICE_TOKEN: TOKEN });
  onair = mockOnair();
});
afterEach(() => {
  onair.restore();
  sb.cleanup();
});

const intro = { space: "guide", slug: ["intro"] };

/** 서비스 요청 머리글 */
function svc(opts: { token?: string; role?: string; name?: string; peer?: string | null; extra?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "x-offair-service": opts.token ?? TOKEN, ...(opts.extra ?? {}) };
  if (opts.role !== undefined) headers["x-offair-as-role"] = opts.role;
  if (opts.name !== undefined) headers["x-offair-as-name"] = encodeURIComponent(opts.name);
  if (opts.peer !== null) headers[PEER_HEADER] = peerStamp(opts.peer ?? "127.0.0.1");
  return headers;
}

async function membersDoc() {
  // 부원 공간에 문서 하나 (부장이 만든다)
  const r = await h.createDoc(
    req("POST", "/x", { token: "tok-lead", body: { title: "부원 회의", category: "회의", body: "\n## 안건\n\n다음 주 방송 순서\n" } }),
    { space: "members" }
  );
  assert.equal(r.status, 201);
  return { space: "members", slug: (((await bodyOf(r)).doc as { slug: string[] }).slug) };
}

describe("서비스 토큰", () => {
  test("맞는 토큰 + 127.0.0.1 → 그 역할로 읽기", async () => {
    const me = await bodyOf(await h.me(req("GET", "/api/me", { headers: svc({ role: "member", name: "김부원 (CUE)" }) })));
    assert.equal(me.role, "member");
    assert.equal(me.name, "김부원 (CUE)");
    assert.equal(me.canReadMembers, true);
    const ipv6 = await bodyOf(await h.me(req("GET", "/api/me", { headers: svc({ role: "lead", peer: "::1" }) })));
    assert.equal(ipv6.role, "lead");
    const mapped = await bodyOf(await h.me(req("GET", "/api/me", { headers: svc({ role: "lead", peer: "::ffff:127.0.0.1" }) })));
    assert.equal(mapped.role, "lead");
    assert.equal(onair.calls.length, 0, "ONAIR 는 부르지 않는다");
  });

  test("토큰 env 가 없으면 기능이 꺼져 머리글을 무시한다 (손님)", async () => {
    delete process.env.OFFAIR_SERVICE_TOKEN;
    const me = await bodyOf(await h.me(req("GET", "/api/me", { headers: svc({ role: "lead" }) })));
    assert.equal(me.role, "guest");
    const m = await membersDoc();
    assert.equal((await h.getDoc(req("GET", "/x", { headers: svc({ role: "lead" }) }), m)).status, 401);
  });

  test("틀린 토큰·바깥 주소·소켓 표시 없음·위조한 소켓 표시·Cloudflare 흔적 → 403", async () => {
    const st = async (headers: Record<string, string>) => (await h.getDoc(req("GET", "/x", { headers }), intro)).status;
    assert.equal(await st(svc({ token: "wrong", role: "lead" })), 403);
    assert.equal(await st(svc({ role: "lead", peer: "192.168.0.10" })), 403);
    assert.equal(await st(svc({ role: "lead", peer: null })), 403, "소켓 표시가 없으면 믿지 않는다");
    assert.equal(await st({ ...svc({ role: "lead", peer: null }), [PEER_HEADER]: "127.0.0.1;guess" }), 403, "난수가 다르면 위조");
    assert.equal(await st({ ...svc({ role: "lead", peer: null }), "x-forwarded-for": "127.0.0.1" }), 403, "XFF 는 믿지 않는다");
    assert.equal(await st(svc({ role: "lead", extra: { "cf-connecting-ip": "1.2.3.4" } })), 403);
    assert.equal(await st(svc({ role: "lead", extra: { "cf-ray": "abc-ICN" } })), 403);
    assert.equal(await st(svc({ role: "lead", extra: { "cdn-loop": "cloudflare" } })), 403);
  });

  test("읽기 전용: GET 이 아니면 403", async () => {
    const got = await bodyOf(await h.getDoc(req("GET", "/x", { headers: svc({ role: "lead" }) }), intro));
    const put = await h.saveDoc(req("PUT", "/x", { headers: svc({ role: "lead" }), body: { baseRev: got.rev, body: "\n바꿈\n" } }), intro);
    assert.equal(put.status, 403);
    const post = await h.addComment(req("POST", "/x", { headers: svc({ role: "lead" }), body: { body: "x" } }), intro);
    assert.equal(post.status, 403);
    const del = await h.deleteDoc(req("DELETE", "/x", { headers: svc({ role: "superadmin" }) }), intro);
    assert.equal(del.status, 403);
    assert.ok(fs.existsSync(path.join(sb.guide, "content/docs/intro.mdx")));
  });

  test("대리 역할: 부원·졸업생은 두 공간을 읽고, 교사·손님·모르는 역할은 못 읽는다", async () => {
    const m = await membersDoc();
    const st = async (role: string) => (await h.getDoc(req("GET", "/x", { headers: svc({ role }) }), m)).status;
    assert.equal(await st("member"), 200);
    assert.equal(await st("alumni"), 200);
    assert.equal(await st("lead"), 200);
    assert.equal(await st("teacher"), 403);
    assert.equal(await st("guest"), 401);
    assert.equal(await st("root"), 401, "모르는 역할은 손님");
    // 가이드북도 부원 전용: 손님·교사 대리는 못 읽고, 부원·졸업생 대리는 읽는다
    const gst = async (role: string) => (await h.getDoc(req("GET", "/x", { headers: svc({ role }) }), intro)).status;
    assert.equal(await gst("guest"), 401);
    assert.equal(await gst("teacher"), 403);
    assert.equal(await gst("member"), 200);
    assert.equal(await gst("alumni"), 200);
    const g1 = await h.search(req("GET", "/x?q=규칙", { headers: svc({ role: "member" }) }), { space: "guide" });
    assert.equal(g1.status, 200);
    assert.ok(((await bodyOf(g1)).results as unknown[]).length > 0);
    assert.equal((await h.search(req("GET", "/x?q=규칙", { headers: svc({ role: "guest" }) }), { space: "guide" })).status, 401);
    // 부원 공간 검색도 같은 규칙
    const s1 = await h.search(req("GET", "/x?q=방송", { headers: svc({ role: "alumni" }) }), { space: "members" });
    assert.equal(s1.status, 200);
    const s2 = await h.search(req("GET", "/x?q=방송", { headers: svc({ role: "teacher" }) }), { space: "members" });
    assert.equal(s2.status, 403);
  });
});

/** CUE 가 부원 대신 읽는 요청 (가이드북도 부원 전용이라 서비스 토큰 + 부원 역할로) */
const CUE = () => ({ headers: svc({ role: "member", name: "김부원" }) });

describe("문서 글 (format=text)", () => {
  test("머리말은 따로, 본문은 마크다운, 절대 주소·마지막 수정", async () => {
    process.env.OFFAIR_PUBLIC_URL = "https://offair.bssmcast.com/";
    const r = await bodyOf(await h.getDoc(req("GET", "/api/wiki/guide/docs/intro?format=text", CUE()), intro));
    assert.equal(r.title, "소개");
    assert.equal(r.description, "첫 문서");
    assert.equal(r.category, "시작하기");
    assert.equal(r.url, "https://offair.bssmcast.com/docs/intro");
    assert.equal(r.updatedBy, "seed");
    assert.match(String(r.updatedAt), /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(!String(r.text).includes("title:"), "머리말 없음");
    assert.match(String(r.text), /^## 안녕\n\n방송부 가이드입니다\./);
  });

  test("?section= 은 그 소제목 아래만, 없으면 404 + 소제목 목록", async () => {
    fs.writeFileSync(
      path.join(sb.guide, "content/docs/sec.mdx"),
      doc({ title: "구역", category: "운영", order: 2 }, "## 하나\n\n첫째\n\n### 하나-가\n\n안쪽\n\n## 둘\n\n둘째\n")
    );
    const p = { space: "guide", slug: ["sec"] };
    const one = await bodyOf(await h.getDoc(req("GET", "/x?format=text&section=" + encodeURIComponent("하나"), CUE()), p));
    assert.equal(one.text, "## 하나\n\n첫째\n\n### 하나-가\n\n안쪽\n");
    const inner = await bodyOf(await h.getDoc(req("GET", "/x?format=text&section=" + encodeURIComponent("하나-가"), CUE()), p));
    assert.equal(inner.text, "### 하나-가\n\n안쪽\n");
    const miss = await h.getDoc(req("GET", "/x?format=text&section=없음", CUE()), p);
    assert.equal(miss.status, 404);
    assert.deepEqual((await bodyOf(miss)).headings, ["하나", "하나-가", "둘"]);
  });
});

describe("검색 결과 (CUE 용 필드)", () => {
  test("url·slug·space·title·category·snippet·updatedAt, limit 기본 8·최대 20", async () => {
    for (let i = 0; i < 25; i++) {
      fs.writeFileSync(path.join(sb.guide, `content/docs/m${i}.mdx`), doc({ title: `마이크 ${i}`, category: "운영", order: i + 2 }, "마이크 점검\n"));
    }
    const r = await bodyOf(await h.search(req("GET", "/x?q=마이크", CUE()), { space: "guide" }));
    const results = r.results as Record<string, unknown>[];
    assert.equal(results.length, 8);
    const first = results[0];
    for (const k of ["url", "slug", "space", "title", "category", "snippet", "updatedAt"]) assert.ok(k in first, k);
    assert.equal(first.space, "guide");
    assert.match(String(first.url), /^\/docs\//, "OFFAIR_PUBLIC_URL 이 없으면 상대 경로");
    assert.equal((await bodyOf(await h.search(req("GET", "/x?q=마이크&limit=50", CUE()), { space: "guide" }))).results instanceof Array, true);
    assert.equal(((await bodyOf(await h.search(req("GET", "/x?q=마이크&limit=50", CUE()), { space: "guide" }))).results as unknown[]).length, 20);
    process.env.OFFAIR_PUBLIC_URL = "https://offair.bssmcast.com";
    const abs = (await bodyOf(await h.search(req("GET", "/x?q=마이크&limit=1", CUE()), { space: "guide" }))).results as { url: string; path: string }[];
    assert.equal(abs.length, 1);
    assert.match(abs[0].url, /^https:\/\/offair\.bssmcast\.com\/docs\//);
    assert.match(abs[0].path, /^\/docs\//);
  });
});
