import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { getStore, resetStoreForTests } from "@/lib/store";
import { StoreError } from "@/lib/store/errors";
import { doc, editor, makeSandbox, other, type Sandbox } from "./helpers";

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

const guide = () => getStore().guide;

describe("읽기", () => {
  test("트리는 sidebar.json 순서 + frontmatter order", () => {
    const t = guide().tree();
    assert.deepEqual(t.categories, ["시작하기", "운영"]);
    assert.deepEqual(t.groups.map((g) => g.items.map((i) => i.slug.join("/"))), [["intro"], ["rules"]]);
  });

  test("문서 읽기: frontmatter·본문·리비전(git 블롭 해시와 같음)", () => {
    const d = guide().requireDoc("intro");
    assert.equal(d.title, "소개");
    assert.equal(d.frontmatter.category, "시작하기");
    assert.match(d.body, /방송부 가이드입니다/);
    assert.equal(d.toc[0].text, "안녕");
    const blob = sb.git(["rev-parse", "HEAD:content/docs/intro.mdx"]).trim();
    assert.equal(d.rev, blob);
  });

  test("CRLF 로 된 파일도 \\n 으로 읽는다", () => {
    const f = path.join(sb.guide, "content", "docs", "crlf.mdx");
    fs.writeFileSync(f, "---\r\ntitle: 윈도우\r\n---\r\n\r\n본문\r\n");
    const d = guide().requireDoc("crlf");
    assert.equal(d.title, "윈도우");
    assert.ok(!d.raw.includes("\r"));
  });

  test("검색 색인은 본문 평문까지", () => {
    const idx = guide().searchIndex();
    const rules = idx.find((d) => d.slug[0] === "rules")!;
    assert.match(rules.text, /마이크는 끄고 나간다/);
    assert.ok(!rules.text.includes("<Callout"));
  });
});

describe("저장", () => {
  test("저장하면 커밋 하나, 작성자는 사용자 이름", async () => {
    const d = guide().requireDoc("intro");
    const r = await guide().save("intro", { baseRev: d.rev, body: d.body + "\n추가한 줄\n", message: "오타 수정" }, editor);
    assert.ok(r.commit);
    assert.match(r.doc!.raw, /추가한 줄/);
    assert.notEqual(r.doc!.rev, d.rev);
    const log = sb.git(["log", "-1", "--format=%an|%ae|%s|%b"]).trim();
    assert.equal(log, "김부원|m-1@members.offair.local|docs :: 「소개」 수정|오타 수정");
    // 줄바꿈은 \n 만
    assert.ok(!fs.readFileSync(path.join(sb.guide, "content/docs/intro.mdx"), "utf8").includes("\r"));
  });

  test("다른 사람이 먼저 저장했으면 409 conflict + 지금 리비전", async () => {
    const d = guide().requireDoc("intro");
    const first = await guide().save("intro", { baseRev: d.rev, body: "\n먼저 저장\n" }, editor);
    await assert.rejects(
      guide().save("intro", { baseRev: d.rev, body: "\n늦게 저장\n" }, other),
      (e: unknown) =>
        e instanceof StoreError && e.status === 409 && e.code === "conflict" && e.extra.currentRev === first.doc!.rev
    );
    assert.match(guide().requireDoc("intro").raw, /먼저 저장/);
  });

  test("동시에 같은 baseRev 로 저장하면 하나만 성공", async () => {
    const d = guide().requireDoc("intro");
    const results = await Promise.allSettled([
      guide().save("intro", { baseRev: d.rev, body: "\nA\n" }, editor),
      guide().save("intro", { baseRev: d.rev, body: "\nB\n" }, other),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  });

  test("baseRev 없이 저장 불가, 바뀐 게 없으면 커밋 안 함", async () => {
    await assert.rejects(guide().save("intro", { baseRev: "" }, editor), /baseRev/);
    const d = guide().requireDoc("intro");
    const before = sb.git(["rev-parse", "HEAD"]).trim();
    const r = await guide().save("intro", { baseRev: d.rev, raw: d.raw }, editor);
    assert.equal(r.commit, null);
    assert.equal(sb.git(["rev-parse", "HEAD"]).trim(), before);
  });

  test("커밋이 실패하면 파일을 되돌린다", async () => {
    process.env.OFFAIR_GIT_BIN = path.join(sb.dir, "no-such-git");
    resetStoreForTests();
    const d = guide().requireDoc("intro");
    await assert.rejects(guide().save("intro", { baseRev: d.rev, body: "\n망가짐\n" }, editor));
    delete process.env.OFFAIR_GIT_BIN;
    resetStoreForTests();
    assert.equal(guide().requireDoc("intro").raw, d.raw);
  });

  test("작업 폴더의 다른 변경은 커밋하지 않는다", async () => {
    fs.writeFileSync(path.join(sb.guide, "README.md"), "남의 작업\n");
    const d = guide().requireDoc("intro");
    await guide().save("intro", { baseRev: d.rev, body: "\n바꿈\n" }, editor);
    assert.match(sb.git(["status", "--porcelain"]), /\?\? README\.md/);
    assert.equal(sb.git(["show", "--name-only", "--format=", "HEAD"]).trim(), "content/docs/intro.mdx");
  });
});

describe("만들기·옮기기·지우기", () => {
  test("만들기: 제목으로 경로, 같은 카테고리 마지막 순서", async () => {
    const r = await guide().create({ title: "새 문서 하나", category: "운영" }, editor);
    assert.deepEqual(r.doc!.slug, ["새-문서-하나"]);
    assert.equal(r.doc!.order, 2);
    const r2 = await guide().create({ title: "새 문서 하나", category: "운영" }, editor);
    assert.deepEqual(r2.doc!.slug, ["새-문서-하나-2"]);
    await assert.rejects(guide().create({ title: "x", slug: "intro" }, editor), (e: unknown) => (e as StoreError).code === "exists");
    await assert.rejects(guide().create({ title: "x", slug: "../evil" }, editor), (e: unknown) => (e as StoreError).code === "bad_path");
  });

  test("이름 바꾸기는 이력이 이어지고, 카테고리 이동·순서 변경", async () => {
    const d = guide().requireDoc("intro");
    await guide().save("intro", { baseRev: d.rev, body: d.body + "\n두 번째 판\n" }, editor);
    const m = await guide().move("intro", { to: "start/welcome", category: "운영", index: 0 }, editor);
    assert.deepEqual(m.doc!.slug, ["start", "welcome"]);
    assert.equal(m.doc!.category, "운영");
    assert.equal(guide().getDoc("intro"), null);
    const t = guide().tree();
    assert.deepEqual(t.groups.find((g) => g.category === "운영")!.items.map((i) => i.slug.join("/")), ["start/welcome", "rules"]);
    const h = await guide().history("start/welcome");
    assert.ok(h.length >= 3, `이력이 이어져야 함: ${h.length}`);
    assert.ok(h.some((e) => e.status === "R"));
    assert.ok(h.some((e) => e.path === "content/docs/intro.mdx"));
  });

  test("지우기는 git rm — 휴지통에서 보이고 되살릴 수 있다", async () => {
    await guide().remove("rules", {}, editor);
    assert.equal(guide().getDoc("rules"), null);
    const trash = await guide().trash();
    assert.equal(trash[0].title, "규칙");
    const h = await guide().history("rules");
    const seed = h.find((e) => e.status === "A")!;
    const r = await guide().revert("rules", seed.rev, {}, editor);
    assert.equal(r.doc!.title, "규칙");
    assert.equal((await guide().trash()).length, 0);
  });
});

describe("이력·비교·되돌리기", () => {
  test("이력 → 리비전 내용 → diff → 되돌리기(새 커밋)", async () => {
    const d0 = guide().requireDoc("intro");
    const r1 = await guide().save("intro", { baseRev: d0.rev, frontmatter: { title: "소개 v2" } }, editor);
    const r2 = await guide().save("intro", { baseRev: r1.doc!.rev, body: "\n완전히 새 본문\n" }, other);

    const h = await guide().history("intro");
    assert.equal(h.length, 3);
    assert.deepEqual(h.map((e) => e.author), ["이부원", "김부원", "seed"]);
    assert.equal(h[0].rev, r2.commit);

    const old = await guide().revision("intro", h[2].shortRev);
    assert.equal(old.raw, d0.raw);
    assert.equal(old.title, "소개");

    const df = await guide().diff("intro", h[1].rev, h[0].rev);
    assert.ok(df.removed > 0 && df.added > 0);
    assert.ok(df.lines.some((l) => l.type === "add" && l.text === "완전히 새 본문"));
    assert.match(df.unified, /^\+완전히 새 본문$/m);

    const cur = guide().requireDoc("intro");
    const rv = await guide().revert("intro", h[2].rev, { baseRev: cur.rev }, editor);
    assert.equal(rv.doc!.raw, d0.raw);
    assert.match(sb.git(["log", "-1", "--format=%s"]), /「소개」 .{7} 버전으로 되돌림/);
    assert.equal((await guide().history("intro")).length, 4);

    await assert.rejects(guide().revert("intro", h[2].rev, { baseRev: cur.rev }, editor), (e: unknown) => (e as StoreError).status === 409);
  });

  test("이력 항목에 바뀐 줄 수(+/−)와 편집 요약이 붙는다", async () => {
    const d0 = guide().requireDoc("intro");
    await guide().save("intro", { baseRev: d0.rev, body: d0.body + "\n새 줄 하나\n\n새 줄 둘\n", message: "줄 두 개 더함" }, editor);
    const h = await guide().history("intro");
    assert.equal(h[0].body, "줄 두 개 더함");
    assert.ok(h[0].added >= 2, `더한 줄: ${h[0].added}`);
    assert.equal(h[0].removed, 0);
    assert.ok(h[1].added > 0, "처음 만든 커밋도 줄 수가 있다");
  });
});

describe("사이드바", () => {
  test("배치 저장은 바뀐 파일만, 한 커밋", async () => {
    const before = sb.git(["rev-list", "--count", "HEAD"]).trim();
    const r = await guide().setLayout(
      [
        { category: "운영", items: ["rules", "intro"] },
        { category: "빈 카테고리", items: [] },
      ],
      editor
    );
    assert.ok(r.commit);
    assert.equal(Number(sb.git(["rev-list", "--count", "HEAD"]).trim()), Number(before) + 1);
    assert.deepEqual(r.tree.categories.slice(0, 2), ["운영", "빈 카테고리"]);
    assert.equal(guide().requireDoc("intro").order, 2);
    const sidebar = JSON.parse(fs.readFileSync(path.join(sb.guide, "content/sidebar.json"), "utf8"));
    assert.deepEqual(sidebar.categories, ["운영", "빈 카테고리"]);
  });

  test("카테고리 이름 바꾸기는 문서 frontmatter 도 바꾼다, 빈 것만 지운다", async () => {
    await guide().editCategories({ action: "rename", from: "운영", to: "운영·기타" }, editor);
    assert.equal(guide().requireDoc("rules").category, "운영·기타");
    await assert.rejects(guide().editCategories({ action: "remove", name: "운영·기타" }, editor), (e: unknown) => (e as StoreError).status === 409);
    await guide().editCategories({ action: "add", name: "새 칸", index: 0 }, editor);
    assert.equal(guide().tree().categories[0], "새 칸");
    await guide().editCategories({ action: "remove", name: "새 칸" }, editor);
    assert.ok(!guide().tree().categories.includes("새 칸"));
  });
});

test("부원 공간은 처음 쓸 때 데이터 폴더에 따로 git init", async () => {
  const members = getStore().members!;
  const r = await members.create({ title: "부원 공지", category: "공지", body: "\n비밀\n" }, editor);
  assert.ok(r.commit);
  assert.ok(fs.existsSync(path.join(sb.data, "members", ".git")));
  assert.ok(fs.existsSync(path.join(sb.data, "members", "docs", "부원-공지.mdx")));
  void doc;
});
