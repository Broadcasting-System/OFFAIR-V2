import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";
import { getStore } from "@/lib/store";
import { editor, makeSandbox, type Sandbox } from "./helpers";

let sb: Sandbox | null = null;
afterEach(() => {
  sb?.cleanup();
  sb = null;
});

const waitFor = async (cond: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("시간 초과");
};

test("저장하면 debounce 뒤 pull --rebase 후 push, 부원 공간은 push 하지 않는다", async () => {
  sb = makeSandbox();
  const s = sb;
  const remote = path.join(s.dir, "remote.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  s.git(["remote", "add", "origin", remote]);
  s.git(["push", "-q", "origin", "main"]);

  // 원격에 다른 사람이 먼저 올린 커밋 (rebase 로 합쳐져야 함)
  const other = path.join(s.dir, "other");
  execFileSync("git", ["clone", "-q", remote, other]);
  fs.writeFileSync(path.join(other, "NOTE.md"), "원격 변경\n");
  const env = { ...process.env, GIT_AUTHOR_NAME: "o", GIT_AUTHOR_EMAIL: "o@o", GIT_COMMITTER_NAME: "o", GIT_COMMITTER_EMAIL: "o@o" };
  execFileSync("git", ["add", "-A"], { cwd: other, env });
  execFileSync("git", ["commit", "-qm", "remote change"], { cwd: other, env });
  execFileSync("git", ["push", "-q", "origin", "HEAD:main"], { cwd: other, env });

  process.env.OFFAIR_GIT_PUSH = "1";
  process.env.OFFAIR_GIT_PUSH_DEBOUNCE_MS = "50";
  const store = getStore();
  const d = store.guide.requireDoc("intro");
  await store.guide.save("intro", { baseRev: d.rev, body: "\n올라갈 내용\n" }, editor);
  await store.members!.create({ title: "부원 전용" }, editor);

  await waitFor(() => store.pusher.status().lastSuccessAt !== null);
  const log = execFileSync("git", ["log", "--format=%s", "main"], { cwd: remote, encoding: "utf8" });
  assert.match(log, /「소개」 수정/);
  assert.match(log, /remote change/);
  assert.ok(!log.includes("부원 전용"));
  assert.equal(store.pusher.status().pending, false);
});

test("push 가 실패해도 저장은 되고, 오류를 남긴 뒤 다시 시도 예약", async () => {
  sb = makeSandbox();
  sb.git(["remote", "add", "origin", path.join(sb.dir, "없는-원격.git")]);
  process.env.OFFAIR_GIT_PUSH = "1";
  process.env.OFFAIR_GIT_PUSH_DEBOUNCE_MS = "20";
  const store = getStore();
  const d = store.guide.requireDoc("intro");
  const r = await store.guide.save("intro", { baseRev: d.rev, body: "\n저장은 된다\n" }, editor);
  assert.ok(r.commit);
  await waitFor(() => store.pusher.status().failures > 0);
  const st = store.pusher.status();
  assert.ok(st.lastError);
  assert.equal(st.pending, true);
  assert.ok(st.nextAttemptAt);
  assert.match(fs.readFileSync(path.join(sb.data, "logs", "push.log"), "utf8"), /실패/);
});
