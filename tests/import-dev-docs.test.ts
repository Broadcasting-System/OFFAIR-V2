/**
 * 개발 문서 씨앗 가져오기 (lib/store/import-docs.ts, scripts/import-dev-docs.ts).
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { getStore } from "@/lib/store";
import { importDocs, SEED_MANIFEST } from "@/lib/store/import-docs";
import { doc, editor, makeSandbox, type Sandbox } from "./helpers";

let sb: Sandbox;
let seed: string;

beforeEach(() => {
  sb = makeSandbox();
  seed = path.join(sb.dir, "seed");
  fs.mkdirSync(seed);
});
afterEach(() => sb.cleanup());

function put(rel: string, text: string) {
  const f = path.join(seed, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
}

const members = () => getStore().members!;
const membersGit = (args: string[]) => sb.git(args, path.join(sb.data, "members"));
/** 저장소를 처음 만들 때의 "init" 커밋은 빼고 센다 */
const commitCount = () => Number(membersGit(["rev-list", "--count", "HEAD"]).trim()) - 1;

function seedBasics() {
  put("overview.mdx", doc({ title: "서버 구조", description: "한눈에", category: "서버", order: 1 }, "## 큰 그림\n\nFastAPI 와 Next.\n"));
  put("deploy/windows.md", doc({ title: "서버 PC 배포", category: "배포", order: 2 }, "1. 받는다\n2. 빌드한다\n"));
  put("notitle.md", "# 제목 없는 메모\n\n본문\n");
  put("README.md", "# 이 폴더 설명\n");
  put("_draft.md", doc({ title: "초안" }, "아직"));
  put(".hidden/x.md", doc({ title: "숨김" }, "x"));
  put("notes.txt", "문서 아님");
}

describe("개발 문서 가져오기", () => {
  test("머리말을 지키며 한 커밋으로 넣고, 사이드바 카테고리를 붙인다", async () => {
    seedBasics();
    const r = await importDocs(members(), seed, { source: "offair-dev @ abc1234" });
    assert.deepEqual([r.added, r.updated, r.unchanged, r.skipped], [3, 0, 0, 0]);
    assert.ok(r.commit);

    const d = members().requireDoc(["deploy", "windows"]);
    assert.deepEqual([d.title, d.category, d.order, d.url], ["서버 PC 배포", "배포", 2, "/members/deploy/windows"]);
    const o = members().requireDoc("overview");
    assert.deepEqual([o.title, o.description, o.category], ["서버 구조", "한눈에", "서버"]);
    // title 이 없으면 첫 # 제목, 카테고리가 없으면 "문서"
    const n = members().requireDoc("notitle");
    assert.deepEqual([n.title, n.category], ["제목 없는 메모", "문서"]);
    // README·_·. 로 시작하는 것, .md/.mdx 가 아닌 것은 안 들어간다
    assert.equal(members().listDocs().length, 3);

    assert.deepEqual(members().readSidebar().categories, ["배포", "문서", "서버"]);
    assert.ok(members().tree().groups.some((g) => g.category === "배포" && g.items.length === 1));

    // 한 커밋, 작성자·메시지가 분명하다
    assert.equal(commitCount(), 1);
    const log = membersGit(["log", "-1", "--format=%an <%ae>%n%s%n%b"]);
    assert.match(log, /^개발 문서 가져오기 <seed@members\.offair\.local>/);
    assert.match(log, /docs :: 개발 문서 가져오기 \(새 문서 3, 바뀐 문서 0\)/);
    assert.match(log, /씨앗: offair-dev @ abc1234/);
    assert.match(log, /\+ deploy\/windows \(deploy\/windows\.md\)/);
    const files = membersGit(["show", "--name-only", "--format=", "HEAD"]).trim().split("\n").sort();
    assert.deepEqual(files, ["docs/deploy/windows.mdx", "docs/notitle.mdx", "docs/overview.mdx", SEED_MANIFEST, "sidebar.json"].sort());
    // 공개(가이드북) 저장소는 그대로
    assert.equal(sb.git(["rev-list", "--count", "HEAD"]).trim(), "1");
  });

  test("씨앗 sidebar.json 이 있으면 새 카테고리를 그 순서로 붙인다", async () => {
    put("b.mdx", doc({ title: "기능", category: "기능별", order: 1 }, "x\n"));
    put("a.mdx", doc({ title: "구조", category: "시작하기", order: 1 }, "x\n"));
    put("c.mdx", doc({ title: "서버", category: "서버", order: 1 }, "x\n"));
    put("d.mdx", doc({ title: "기타", category: "기타", order: 1 }, "x\n"));
    fs.writeFileSync(path.join(seed, "sidebar.json"), JSON.stringify({ categories: ["시작하기", "서버", "기능별"] }));
    const r = await importDocs(members(), seed);
    assert.deepEqual(r.categoriesAdded, ["시작하기", "서버", "기능별", "기타"]);
    assert.deepEqual(members().readSidebar().categories, ["시작하기", "서버", "기능별", "기타"]);
  });

  test("다시 돌리면 같은 문서는 건너뛰고 커밋도 없다. 씨앗이 바뀐 것만 고친다", async () => {
    seedBasics();
    await importDocs(members(), seed);
    const again = await importDocs(members(), seed);
    assert.deepEqual([again.added, again.updated, again.unchanged, again.commit], [0, 0, 3, null]);
    assert.equal(commitCount(), 1);

    put("overview.mdx", doc({ title: "서버 구조", description: "한눈에", category: "서버", order: 1 }, "## 큰 그림\n\n바뀐 설명\n"));
    const third = await importDocs(members(), seed);
    assert.deepEqual([third.added, third.updated, third.unchanged], [0, 1, 2]);
    assert.match(members().requireDoc("overview").body, /바뀐 설명/);
    assert.equal(commitCount(), 2);
    assert.match(membersGit(["log", "-1", "--format=%s"]), /새 문서 0, 바뀐 문서 1/);
  });

  test("아무것도 지우지 않고, 위키에서 고친 문서·원래 있던 같은 경로 문서는 덮어쓰지 않는다", async () => {
    seedBasics();
    // 위키에 원래 있던 문서 (씨앗과 같은 경로)
    await members().create({ title: "원래 문서", slug: "overview", category: "기타", body: "\n사람이 쓴 글\n" }, editor);
    const keep = await members().create({ title: "씨앗에 없는 문서", category: "기타" }, editor);

    const r = await importDocs(members(), seed);
    assert.equal(r.items.find((i) => i.slug === "overview")?.action, "skipped");
    assert.match(members().requireDoc("overview").body, /사람이 쓴 글/);

    // 가져온 문서를 위키에서 고치면, 씨앗이 바뀌어도 그대로 둔다
    const d = members().requireDoc(["deploy", "windows"]);
    await members().save(d.slug, { baseRev: d.rev, body: "\n위키에서 고침\n" }, editor);
    put("deploy/windows.md", doc({ title: "서버 PC 배포", category: "배포", order: 2 }, "씨앗도 바뀜\n"));
    // 씨앗에서 문서를 빼도 위키에서는 안 지운다
    fs.rmSync(path.join(seed, "notitle.md"));

    const r2 = await importDocs(members(), seed);
    const w = r2.items.find((i) => i.slug === "deploy/windows");
    assert.equal(w?.action, "skipped");
    assert.match(w?.reason ?? "", /위키에서 고친/);
    assert.match(members().requireDoc(["deploy", "windows"]).body, /위키에서 고침/);
    assert.ok(members().getDoc("notitle"), "씨앗에서 빠져도 남는다");
    assert.ok(members().getDoc(keep.doc!.slug), "씨앗에 없는 위키 문서도 남는다");

    // --overwrite 면 덮어쓴다
    const r3 = await importDocs(members(), seed, { overwrite: true });
    assert.equal(r3.updated, 2);
    assert.match(members().requireDoc(["deploy", "windows"]).body, /씨앗도 바뀜/);
  });

  test("MDX 로 못 읽는 문서·잘못된 파일 이름은 건너뛰고 이유를 알려 준다. 시험 실행은 쓰지 않는다", async () => {
    put("ok.md", doc({ title: "좋음" }, "괜찮은 글\n"));
    put("broken.md", doc({ title: "깨짐" }, "중괄호 { 가 열린 채\n"));
    put("CON.md", doc({ title: "예약 이름" }, "x\n"));
    put("both.md", doc({ title: "둘 A" }, "a\n"));
    put("both.mdx", doc({ title: "둘 B" }, "b\n"));

    const dry = await importDocs(members(), seed, { dryRun: true });
    assert.equal(dry.commit, null);
    assert.equal(members().listDocs().length, 0, "시험 실행은 아무것도 안 쓴다");

    const r = await importDocs(members(), seed);
    const by = Object.fromEntries(r.items.map((i) => [i.file, i]));
    assert.equal(by["ok.md"].action, "added");
    assert.equal(by["broken.md"].action, "skipped");
    assert.match(by["broken.md"].reason ?? "", /MDX/);
    assert.equal(by["CON.md"].action, "skipped");
    assert.equal(by["both.md"].action, "added");
    assert.equal(by["both.mdx"].action, "skipped");
    assert.deepEqual(members().listDocs().map((d) => d.slug.join("/")).sort(), ["both", "ok"]);
  });

  test("명령줄: 경로 인자나 OFFAIR_DEV_DOCS_SEED 로 돌고, 없는 폴더는 1, 인자 없으면 2", () => {
    seedBasics();
    const env: NodeJS.ProcessEnv = { ...process.env, OFFAIR_GUIDE_REPO: sb.guide, OFFAIR_DATA_DIR: sb.data };
    delete env.OFFAIR_DEV_DOCS_SEED;
    const run = (args: string[], extra: Record<string, string> = {}) =>
      spawnSync(process.execPath, ["--import", "tsx", path.join("scripts", "import-dev-docs.ts"), ...args], {
        cwd: path.resolve(__dirname, ".."),
        env: { ...env, ...extra },
        encoding: "utf8",
      });

    const first = run([seed]);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /끝: 새로 3 · 바꿈 0 · 같음 0 · 건너뜀 0 · 커밋 [0-9a-f]{7}/);

    const viaEnv = run([], { OFFAIR_DEV_DOCS_SEED: seed });
    assert.equal(viaEnv.status, 0, viaEnv.stderr);
    assert.match(viaEnv.stdout, /새로 0 · 바꿈 0 · 같음 3 · 건너뜀 0 · 커밋 없음/);

    assert.equal(run([path.join(sb.dir, "nope")]).status, 1);
    assert.equal(run([]).status, 2);
    const log = execFileSync("git", ["-C", path.join(sb.data, "members"), "log", "--format=%s"], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(log, ["docs :: 개발 문서 가져오기 (새 문서 3, 바뀐 문서 0)", "init :: 저장소 만듦"]);
  });
});
