import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import * as h from "@/lib/wiki/handlers";
import { PNG_1PX, bodyOf, makeSandbox, mockOnair, req, type FetchMock, type Sandbox } from "./helpers";

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

const G = { space: "guide" };
const intro = { space: "guide", slug: ["intro"] };

describe("문서 API", () => {
  test("GET → PUT(baseRev) → 같은 baseRev 로 다시 PUT 하면 409", async () => {
    const got = await bodyOf(await h.getDoc(req("GET", "/api/wiki/guide/docs/intro"), intro));
    assert.equal(got.title, "소개");
    assert.equal((got.lastCommit as { author: string }).author, "seed");
    assert.equal(got.commentCount, undefined, "손님에게는 댓글 수도 안 보임");

    const put = await h.saveDoc(
      req("PUT", "/api/wiki/guide/docs/intro", { token: "tok-member", body: { baseRev: got.rev, body: "\n새 본문\n" } }),
      intro
    );
    assert.equal(put.status, 200);
    const saved = await bodyOf(put);
    assert.ok(saved.commit);

    const stale = await h.saveDoc(
      req("PUT", "/api/wiki/guide/docs/intro", { token: "tok-member2", body: { baseRev: got.rev, body: "\n덮어쓰기\n" } }),
      intro
    );
    assert.equal(stale.status, 409);
    const err = await bodyOf(stale);
    assert.equal(err.error, "conflict");
    assert.equal(err.currentRev, (saved.doc as { rev: string }).rev);
  });

  test("baseRev 없는 PUT 은 400, 없는 문서 404, 나쁜 경로 400, 없는 공간 404", async () => {
    const t = { token: "tok-member" };
    assert.equal((await h.saveDoc(req("PUT", "/x", { ...t, body: { body: "x" } }), intro)).status, 400);
    assert.equal((await h.getDoc(req("GET", "/x"), { space: "guide", slug: ["nope"] })).status, 404);
    assert.equal((await h.getDoc(req("GET", "/x"), { space: "guide", slug: ["..", "etc"] })).status, 400);
    assert.equal((await h.getDoc(req("GET", "/x"), { space: "guide", slug: ["%2e%2e", "x"] })).status, 400);
    assert.equal((await h.tree(req("GET", "/x"), { space: "secret" })).status, 404);
  });

  test("다른 사이트 Origin 의 쓰기 요청은 403", async () => {
    const res = await h.createDoc(
      req("POST", "/api/wiki/guide/docs", {
        token: "tok-member",
        body: { title: "x" },
        headers: { origin: "https://evil.example", host: "wiki.test" },
      }),
      G
    );
    assert.equal(res.status, 403);
    const ok = await h.createDoc(
      req("POST", "/api/wiki/guide/docs", {
        token: "tok-member",
        body: { title: "같은 사이트" },
        headers: { origin: "https://wiki.example", "x-forwarded-host": "wiki.example", host: "127.0.0.1:3000" },
      }),
      G
    );
    assert.equal(ok.status, 201);
    process.env.OFFAIR_ALLOWED_ORIGINS = "https://wiki.example";
    try {
      const viaTunnel = await h.createDoc(
        req("POST", "/x", { token: "tok-member", body: { title: "터널" }, headers: { origin: "https://wiki.example", host: "localhost:3000" } }),
        G
      );
      assert.equal(viaTunnel.status, 201);
    } finally {
      delete process.env.OFFAIR_ALLOWED_ORIGINS;
    }
  });

  test("이동·사이드바·이력·diff·되돌리기", async () => {
    const t = "tok-lead";
    const mv = await bodyOf(
      await h.moveDoc(req("POST", "/api/wiki/guide/move", { token: t, body: { from: "rules", to: "ops/rules", category: "시작하기", index: 0 } }), G)
    );
    assert.deepEqual((mv.doc as { slug: string[] }).slug, ["ops", "rules"]);

    const sidebar = await h.patchSidebar(req("PATCH", "/x", { token: t, body: { action: "add", name: "장비" } }), G);
    assert.equal(sidebar.status, 200);
    const sb2 = await bodyOf(await h.getSidebar(req("GET", "/x"), G));
    assert.ok((sb2.categories as string[]).includes("장비"));

    const p = { space: "guide", slug: ["ops", "rules"] };
    const hist = await bodyOf(await h.history(req("GET", "/x"), p));
    const entries = hist.entries as { rev: string; status: string }[];
    assert.ok(entries.length >= 2);
    const first = entries[entries.length - 1].rev;
    const df = await bodyOf(await h.diff(req("GET", `/x?from=${first}`), p));
    assert.ok(Array.isArray(df.lines));
    const rv = await h.revision(req("GET", `/x?rev=${first}`), p);
    assert.equal(rv.status, 200);
    assert.equal((await bodyOf(rv)).title, "규칙");
    const bad = await h.revision(req("GET", "/x?rev=--output=x"), p);
    assert.equal(bad.status, 400);

    const back = await h.revert(req("POST", "/x", { token: t, body: { rev: first } }), p);
    assert.equal(back.status, 200);
  });

  test("검색: 본문 평문으로 찾고 스니펫", async () => {
    const r = await bodyOf(await h.search(req("GET", "/api/wiki/guide/search?q=마이크"), G));
    const results = r.results as { title: string; snippet: string }[];
    assert.equal(results[0].title, "규칙");
    assert.match(results[0].snippet, /마이크/);
    const all = await bodyOf(await h.search(req("GET", "/api/wiki/guide/search"), G));
    assert.equal((all.docs as unknown[]).length, 2);
  });
});

describe("업로드·파일", () => {
  test("부원 파일은 업로드 뒤 권한 있는 사람만 받는다", async () => {
    const form = new FormData();
    form.set("file", new File([PNG_1PX], "회의 사진.png", { type: "image/png" }));
    form.set("doc", "notice");
    const up = await h.upload(req("POST", "/api/wiki/members/uploads", { token: "tok-member", form }), { space: "members" });
    assert.equal(up.status, 201);
    const info = await bodyOf(up);
    const parts = String(info.url).replace("/api/wiki/members/files/", "").split("/");

    const fp = { space: "members", path: parts };
    assert.equal((await h.file(req("GET", String(info.url)), fp)).status, 401);
    assert.equal((await h.file(req("GET", String(info.url), { token: "tok-teacher" }), fp)).status, 403);
    const ok = await h.file(req("GET", String(info.url), { token: "tok-alumni" }), fp);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("content-type"), "image/png");
    assert.match(ok.headers.get("cache-control")!, /private/);
    assert.deepEqual(Buffer.from(await ok.arrayBuffer()), PNG_1PX);

    const escape = await h.file(req("GET", "/x", { token: "tok-member" }), { space: "members", path: ["..", "docs", "x.mdx"] });
    assert.equal(escape.status, 400);
  });

  test("공개 업로드는 /uploads/ 대체 경로로도 받을 수 있다", async () => {
    const form = new FormData();
    form.set("file", new File([PNG_1PX], "a.png"));
    const info = await bodyOf(await h.upload(req("POST", "/x", { token: "tok-member", form }), G));
    const parts = String(info.url).replace("/uploads/", "").split("/");
    const res = await h.publicUpload(req("GET", String(info.url)), { path: parts });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  });

  test("파일 없음·형식 거부", async () => {
    assert.equal((await h.upload(req("POST", "/x", { token: "tok-member", form: new FormData() }), G)).status, 400);
    const form = new FormData();
    form.set("file", new File([Buffer.from("<script>alert(1)</script>")], "x.html"));
    assert.equal((await h.upload(req("POST", "/x", { token: "tok-member", form }), G)).status, 415);
  });
});

describe("댓글", () => {
  test("쓰기·답글(한 단계)·고치기·지우기는 내 것만, 부장은 남의 것도 지움", async () => {
    const add = (token: string, body: unknown) => h.addComment(req("POST", "/x", { token, body }), intro);
    const c = await bodyOf(await add("tok-member", { body: "첫 댓글" }));
    const r = await bodyOf(await add("tok-member2", { body: "답글", parentId: c.id }));
    const rr = await bodyOf(await add("tok-member", { body: "답글의 답글", parentId: r.id }));
    assert.ok(rr.id);

    const list = await bodyOf(await h.listComments(req("GET", "/x", { token: "tok-alumni" }), intro));
    const comments = list.comments as { id: string; replies: { body: string }[] }[];
    assert.equal(comments.length, 1);
    assert.deepEqual(comments[0].replies.map((x) => x.body), ["답글", "답글의 답글"]);

    // 남의 댓글 고치기·지우기 불가
    assert.equal((await h.editComment(req("PATCH", "/x", { token: "tok-member2", body: { id: c.id, body: "해킹" } }), intro)).status, 403);
    assert.equal((await h.deleteComment(req("DELETE", `/x?id=${c.id}`, { token: "tok-member2" }), intro)).status, 403);
    // 내 것은 됨
    assert.equal((await h.editComment(req("PATCH", "/x", { token: "tok-member", body: { id: c.id, body: "고친 댓글" } }), intro)).status, 200);
    // 답글이 있는 댓글을 지우면 자리만 남는다
    assert.equal((await h.deleteComment(req("DELETE", `/x?id=${c.id}`, { token: "tok-member" }), intro)).status, 200);
    const after = (await bodyOf(await h.listComments(req("GET", "/x", { token: "tok-member" }), intro))).comments as {
      deleted: boolean;
      body: string;
    }[];
    assert.equal(after[0].deleted, true);
    assert.equal(after[0].body, "");
    // 부장은 남의 답글도 지운다
    assert.equal((await h.deleteComment(req("DELETE", `/x?id=${r.id}`, { token: "tok-lead" }), intro)).status, 200);

    // 없는 문서에는 댓글 불가
    assert.equal((await h.addComment(req("POST", "/x", { token: "tok-member", body: { body: "x" } }), { space: "guide", slug: ["nope"] })).status, 404);
    // 빈 댓글 불가
    assert.equal((await add("tok-member", { body: "   " })).status, 400);
  });

  test("문서를 옮기면 댓글도 따라간다", async () => {
    await h.addComment(req("POST", "/x", { token: "tok-member", body: { body: "따라와" } }), intro);
    await h.moveDoc(req("POST", "/x", { token: "tok-member", body: { from: "intro", to: "welcome" } }), G);
    const list = await bodyOf(await h.listComments(req("GET", "/x", { token: "tok-member" }), { space: "guide", slug: ["welcome"] }));
    assert.equal((list.comments as unknown[]).length, 1);
  });
});
