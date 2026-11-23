import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { getStore } from "@/lib/store";
import { getViewer, clearAuthCache } from "@/lib/wiki/auth";
import * as h from "@/lib/wiki/handlers";
import { bodyOf, makeSandbox, mockOnair, req, type FetchMock, type Sandbox } from "./helpers";

let sb: Sandbox;
let onair: FetchMock;
beforeEach(() => {
  sb = makeSandbox({ ONAIR_API_BASE: "http://onair.test" });
  onair = mockOnair();
});
afterEach(() => {
  onair.restore();
  sb.cleanup();
});

describe("ONAIR 신원 확인", () => {
  test("토큰이 없으면 ONAIR 를 부르지 않고 손님", async () => {
    const v = await getViewer(req("GET", "/api/me"));
    assert.equal(v.role, "guest");
    assert.equal(v.authenticated, false);
    assert.equal(onair.calls.length, 0);
  });

  test("Access 머리글을 그대로 넘기고, 60초 캐시", async () => {
    const v = await getViewer(req("GET", "/api/me", { token: "tok-member" }));
    assert.deepEqual([v.role, v.name, v.memberId], ["member", "김부원", "m-1"]);
    await getViewer(req("GET", "/api/me", { token: "tok-member" }));
    assert.equal(onair.calls.length, 1);
    assert.equal(onair.calls[0].url, "http://onair.test/api/members/me");
    assert.equal(onair.calls[0].token, "tok-member");
  });

  test("머리글이 없으면 CF_Authorization 쿠키", async () => {
    const v = await getViewer(req("GET", "/api/me", { headers: { cookie: "a=1; CF_Authorization=tok-lead; b=2" } }));
    assert.equal(v.role, "lead");
  });

  test("승인 대기 부원은 손님, ONAIR 가 죽으면 손님(캐시 안 함)", async () => {
    assert.equal((await getViewer(req("GET", "/", { token: "tok-pending" }))).role, "guest");
    assert.equal((await getViewer(req("GET", "/", { token: "tok-down" }))).role, "guest");
    await getViewer(req("GET", "/", { token: "tok-down" }));
    assert.equal(onair.calls.filter((c) => c.token === "tok-down").length, 2);
  });

  test("개발용 OFFAIR_DEV_ROLE 은 production 에서는 무시", async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.OFFAIR_DEV_ROLE = "lead";
    process.env.OFFAIR_DEV_NAME = "개발자";
    try {
      (process.env as Record<string, string>).NODE_ENV = "development";
      const dev = await getViewer(req("GET", "/"));
      assert.deepEqual([dev.role, dev.name, dev.source], ["lead", "개발자", "dev"]);
      (process.env as Record<string, string>).NODE_ENV = "production";
      clearAuthCache();
      assert.equal((await getViewer(req("GET", "/"))).role, "guest");
    } finally {
      if (prevEnv === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
      else (process.env as Record<string, string>).NODE_ENV = prevEnv;
      delete process.env.OFFAIR_DEV_ROLE;
      delete process.env.OFFAIR_DEV_NAME;
    }
  });

  test("GET /api/me", async () => {
    const r = await bodyOf(await h.me(req("GET", "/api/me", { token: "tok-alumni" })));
    assert.deepEqual(
      { role: r.role, canEdit: r.canEdit, canReadMembers: r.canReadMembers },
      { role: "alumni", canEdit: false, canReadMembers: true }
    );
  });
});

/**
 * 역할 × 동작 → 기대 상태 코드.
 * 401 = 로그인 안 함, 403 = 로그인했지만 권한 부족
 */
describe("권한 표", () => {
  const ROLES = ["anon", "tok-guest", "tok-teacher", "tok-alumni", "tok-member", "tok-lead", "tok-superadmin"] as const;
  type R = (typeof ROLES)[number];
  const expect: Record<string, Record<R, number>> = {
    "guide 읽기": { anon: 401, "tok-guest": 403, "tok-teacher": 403, "tok-alumni": 200, "tok-member": 200, "tok-lead": 200, "tok-superadmin": 200 },
    "guide 트리": { anon: 401, "tok-guest": 403, "tok-teacher": 403, "tok-alumni": 200, "tok-member": 200, "tok-lead": 200, "tok-superadmin": 200 },
    "guide 검색": { anon: 401, "tok-guest": 403, "tok-teacher": 403, "tok-alumni": 200, "tok-member": 200, "tok-lead": 200, "tok-superadmin": 200 },
    "members 읽기": { anon: 401, "tok-guest": 403, "tok-teacher": 403, "tok-alumni": 200, "tok-member": 200, "tok-lead": 200, "tok-superadmin": 200 },
    "guide 쓰기": { anon: 401, "tok-guest": 403, "tok-teacher": 403, "tok-alumni": 403, "tok-member": 201, "tok-lead": 201, "tok-superadmin": 201 },
    "members 쓰기": { anon: 401, "tok-guest": 403, "tok-teacher": 403, "tok-alumni": 403, "tok-member": 201, "tok-lead": 201, "tok-superadmin": 201 },
    "댓글 보기": { anon: 401, "tok-guest": 403, "tok-teacher": 403, "tok-alumni": 200, "tok-member": 200, "tok-lead": 200, "tok-superadmin": 200 },
    "댓글 쓰기": { anon: 401, "tok-guest": 403, "tok-teacher": 403, "tok-alumni": 403, "tok-member": 201, "tok-lead": 201, "tok-superadmin": 201 },
    "push 지금": { anon: 401, "tok-guest": 403, "tok-teacher": 403, "tok-alumni": 403, "tok-member": 403, "tok-lead": 200, "tok-superadmin": 200 },
  };

  let n = 0;
  const actions: Record<string, (token?: string) => Promise<Response>> = {
    "guide 읽기": (t) => h.getDoc(req("GET", "/api/wiki/guide/docs/intro", { token: t }), { space: "guide", slug: ["intro"] }),
    "guide 트리": (t) => h.tree(req("GET", "/api/wiki/guide/tree", { token: t }), { space: "guide" }),
    "guide 검색": (t) => h.search(req("GET", "/api/wiki/guide/search?q=규칙", { token: t }), { space: "guide" }),
    "members 읽기": (t) => h.tree(req("GET", "/api/wiki/members/tree", { token: t }), { space: "members" }),
    "guide 쓰기": (t) =>
      h.createDoc(req("POST", "/api/wiki/guide/docs", { token: t, body: { title: `공개 ${n++}` } }), { space: "guide" }),
    "members 쓰기": (t) =>
      h.createDoc(req("POST", "/api/wiki/members/docs", { token: t, body: { title: `부원 ${n++}` } }), { space: "members" }),
    "댓글 보기": (t) => h.listComments(req("GET", "/api/wiki/guide/comments/intro", { token: t }), { space: "guide", slug: ["intro"] }),
    "댓글 쓰기": (t) =>
      h.addComment(req("POST", "/api/wiki/guide/comments/intro", { token: t, body: { body: "좋아요" } }), { space: "guide", slug: ["intro"] }),
    "push 지금": (t) => h.syncNow(req("POST", "/api/wiki/guide/sync", { token: t }), { space: "guide" }),
  };

  for (const [action, row] of Object.entries(expect)) {
    test(action, async () => {
      for (const role of ROLES) {
        const res = await actions[action](role === "anon" ? undefined : role);
        assert.equal(res.status, row[role], `${action} / ${role}: ${res.status} ${await res.clone().text()}`);
        if (res.status === 401 || res.status === 403) {
          const b = await bodyOf(res);
          assert.equal(b.error, res.status === 401 ? "unauthorized" : "forbidden");
        }
      }
    });
  }

  test("부원 문서는 권한 없는 사람에게 내용도 존재 여부도 안 보인다", async () => {
    await getStore().members!.create({ title: "비밀 공지", body: "\n비밀번호는 1234\n" }, { name: "x", memberId: "x" });
    for (const t of [undefined, "tok-guest", "tok-teacher"]) {
      const urls: [string, () => Promise<Response>][] = [
        ["doc", () => h.getDoc(req("GET", "/api/wiki/members/docs/비밀-공지", { token: t }), { space: "members", slug: ["비밀-공지"] })],
        ["missing", () => h.getDoc(req("GET", "/api/wiki/members/docs/없음", { token: t }), { space: "members", slug: ["없음"] })],
        ["search", () => h.search(req("GET", "/api/wiki/members/search?q=비밀", { token: t }), { space: "members" })],
        ["history", () => h.history(req("GET", "/x", { token: t }), { space: "members", slug: ["비밀-공지"] })],
        ["trash", () => h.trash(req("GET", "/x", { token: t }), { space: "members" })],
      ];
      for (const [name, call] of urls) {
        const res = await call();
        const text = await res.text();
        assert.ok(res.status === 401 || res.status === 403, `${name}/${t}: ${res.status}`);
        assert.ok(!text.includes("1234") && !text.includes("비밀 공지"), `${name}/${t} 내용 노출`);
      }
    }
    const ok = await h.search(req("GET", "/api/wiki/members/search?q=비밀번호", { token: "tok-alumni" }), { space: "members" });
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /1234/);
  });

  test("가이드북도 권한 없는 사람(손님·미등록·교사·승인 대기)에게는 내용도 존재 여부도 안 보인다", async () => {
    const sha = sb.git(["rev-parse", "HEAD"]).trim();
    const G = { space: "guide" };
    const intro = { space: "guide", slug: ["intro"] };
    for (const t of [undefined, "tok-guest", "tok-teacher", "tok-pending"]) {
      const calls: [string, () => Promise<Response>][] = [
        ["tree", () => h.tree(req("GET", "/api/wiki/guide/tree", { token: t }), G)],
        ["search", () => h.search(req("GET", "/api/wiki/guide/search?q=규칙", { token: t }), G)],
        ["index", () => h.search(req("GET", "/api/wiki/guide/search", { token: t }), G)],
        ["doc", () => h.getDoc(req("GET", "/api/wiki/guide/docs/intro", { token: t }), intro)],
        ["text", () => h.getDoc(req("GET", "/api/wiki/guide/docs/intro?format=text", { token: t }), intro)],
        ["missing", () => h.getDoc(req("GET", "/api/wiki/guide/docs/없음", { token: t }), { space: "guide", slug: ["없음"] })],
        ["sidebar", () => h.getSidebar(req("GET", "/x", { token: t }), G)],
        ["history", () => h.history(req("GET", "/x", { token: t }), intro)],
        ["revision", () => h.revision(req("GET", `/x?rev=${sha}`, { token: t }), intro)],
        ["diff", () => h.diff(req("GET", "/x?from=empty", { token: t }), intro)],
        ["trash", () => h.trash(req("GET", "/x", { token: t }), G)],
        ["uploads", () => h.uploads(req("GET", "/x", { token: t }), G)],
        ["comments", () => h.listComments(req("GET", "/x", { token: t }), intro)],
      ];
      for (const [name, call] of calls) {
        const res = await call();
        const text = await res.text();
        assert.ok(res.status === 401 || res.status === 403, `${name}/${t}: ${res.status}`);
        assert.equal(res.status, t === undefined ? 401 : 403, `${name}/${t}`);
        assert.ok(!text.includes("방송부 가이드") && !text.includes("소개") && !text.includes("규칙 본문"), `${name}/${t} 내용 노출`);
      }
    }
    // 졸업생은 읽는다
    const ok = await h.getDoc(req("GET", "/api/wiki/guide/docs/intro", { token: "tok-alumni" }), intro);
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /방송부 가이드/);
  });

  test("내 메뉴(activity)는 읽을 수 있는 공간만, 교사는 아무 공간도 없다", async () => {
    await h.createDoc(req("POST", "/x", { token: "tok-member", body: { title: "고친 문서" } }), { space: "guide" });
    const m = await bodyOf(await h.activity(req("GET", "/api/me/activity", { token: "tok-member" })));
    assert.ok((m.edits as { space: string }[]).some((e) => e.space === "guide"));
    const teacher = await bodyOf(await h.activity(req("GET", "/api/me/activity", { token: "tok-teacher" })));
    assert.deepEqual([teacher.mentions, teacher.edits], [[], []]);
  });
});
