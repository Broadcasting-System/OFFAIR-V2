import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { getSpace, getStore, resetStoreForTests } from "@/lib/store";
import { StoreError } from "@/lib/store/errors";
import { saveUpload } from "@/lib/store/uploads";
import { PNG_1PX, editor, makeSandbox, type Sandbox } from "./helpers";

let sb: Sandbox | null = null;
afterEach(() => {
  sb?.cleanup();
  sb = null;
});

function guideSnapshot(s: Sandbox) {
  return {
    head: s.git(["rev-parse", "HEAD"]).trim(),
    status: s.git(["status", "--porcelain", "--untracked-files=all"]),
    tracked: s.git(["ls-files"]),
  };
}

test("부원 공간 쓰기는 공개 저장소를 건드리지 않는다 (데이터 폴더가 저장소 안에 있어도)", async () => {
  // 기본값처럼 데이터 폴더를 공개 저장소 안(.offair-data)에 둔다
  sb = makeSandbox();
  const s = sb;
  fs.appendFileSync(path.join(s.guide, ".gitignore"), "/.offair-data\n");
  s.git(["commit", "-qam", "ignore data"]);
  process.env.OFFAIR_DATA_DIR = path.join(s.guide, ".offair-data");
  resetStoreForTests();
  const before = guideSnapshot(s);

  const members = getSpace("members");
  const c = await members.create({ title: "부원 비밀", category: "공지", body: "\n비밀 내용\n" }, editor);
  await members.save(c.doc!.slug, { baseRev: c.doc!.rev, body: "\n비밀 내용 2\n" }, editor);
  await members.setLayout([{ category: "공지", items: [c.doc!.slug] }], editor);
  const up = await saveUpload(members, getStore().config.dataDir, { name: "사진.png", bytes: PNG_1PX }, editor);
  await getStore().comments.add("members", c.doc!.slug, { body: "댓글" }, editor);

  assert.deepEqual(guideSnapshot(s), before, "공개 저장소가 바뀌면 안 됨");
  // 부원 저장소는 자기 .git 을 갖는다
  const membersRoot = path.join(s.guide, ".offair-data", "members");
  assert.ok(fs.existsSync(path.join(membersRoot, ".git")));
  const log = s.git(["log", "--format=%s"], membersRoot);
  assert.match(log, /「부원 비밀」 만듦/);
  assert.match(up.url, /^\/api\/wiki\/members\/files\//);
  assert.ok(!fs.existsSync(path.join(s.guide, "public")), "부원 업로드가 public/ 에 들어가면 안 됨");
  // 공개 공간 트리·검색에 안 나온다
  assert.ok(!JSON.stringify(getStore().guide.tree()).includes("부원 비밀"));
  assert.ok(!JSON.stringify(getStore().guide.searchIndex()).includes("비밀 내용"));
});

test("공개 업로드는 public/uploads 에 커밋, 부원 업로드는 데이터 폴더에", async () => {
  sb = makeSandbox();
  const g = await saveUpload(getStore().guide, getStore().config.dataDir, { name: "장비 사진.png", bytes: PNG_1PX }, editor);
  assert.match(g.path, /^public\/uploads\/\d{4}-\d{2}\/장비-사진-[0-9a-f]{6}\.png$/);
  assert.ok(g.url.startsWith("/uploads/"));
  assert.match(sb.git(["log", "-1", "--name-only", "--format=%s"]), /파일 「장비 사진\.png」 올림/);
  const m = await saveUpload(getSpace("members"), getStore().config.dataDir, { name: "a.png", bytes: PNG_1PX }, editor);
  assert.ok(fs.existsSync(path.join(sb.data, "members", ...m.path.split("/"))));
  // 기록은 데이터 폴더에
  assert.ok(fs.existsSync(path.join(sb.data, "uploads", "guide.jsonl")));
});

test("업로드 형식·크기·내용 확인", async () => {
  sb = makeSandbox({ OFFAIR_UPLOAD_MAX_IMAGE_MB: "0.0001" });
  const guide = getStore().guide;
  const dataDir = getStore().config.dataDir;
  const code = (p: Promise<unknown>) => p.then(() => "ok", (e: StoreError) => e.code);
  assert.equal(await code(saveUpload(guide, dataDir, { name: "x.svg", bytes: Buffer.from("<svg/>") }, editor)), "unsupported_type");
  assert.equal(await code(saveUpload(guide, dataDir, { name: "x.html", bytes: Buffer.from("<b>") }, editor)), "unsupported_type");
  assert.equal(await code(saveUpload(guide, dataDir, { name: "fake.png", bytes: Buffer.from("<script>") }, editor)), "unsupported_type");
  assert.equal(await code(saveUpload(guide, dataDir, { name: "big.png", bytes: Buffer.concat([PNG_1PX, Buffer.alloc(200)]) }, editor)), "too_large");
});

test("데이터 폴더가 public/·content/ 안이면 부원 공간을 막는다", () => {
  sb = makeSandbox();
  for (const bad of ["public/data", "content/members", "app/x"]) {
    process.env.OFFAIR_DATA_DIR = path.join(sb.guide, bad);
    resetStoreForTests();
    assert.equal(getStore().members, null, bad);
    assert.throws(() => getSpace("members"), (e: unknown) => (e as StoreError).code === "unavailable");
  }
});

test("읽기 전용(Vercel)이면 모든 쓰기가 503", async () => {
  sb = makeSandbox({ VERCEL: "1" });
  const d = getStore().guide.requireDoc("intro");
  await assert.rejects(getStore().guide.save("intro", { baseRev: d.rev, body: "x" }, editor), (e: unknown) => (e as StoreError).code === "read_only");
  // 읽기는 된다
  assert.equal(getStore().guide.tree().groups.length, 2);
});
