import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { StoreError } from "./errors";
import { toPosix } from "./paths";

/**
 * git 을 child_process 로 부른다. 언제나 인자 배열로 넘기고(셸 없음),
 * 경로는 저장소 최상위 기준 슬래시 경로로 바꿔 넘긴다 — Windows 에서도 같다.
 */

export interface GitIdentity {
  name: string;
  email: string;
}

export interface GitOptions {
  bin: string;
  committer: GitIdentity;
  /**
   * 이 폴더가 곧 저장소 최상위여야 한다 (부원 공간).
   * 상위 폴더의 다른 저장소(공개 저장소)에 섞여 커밋되는 일을 막는다.
   */
  ownRoot?: boolean;
}

export interface HistoryEntry {
  rev: string;
  shortRev: string;
  author: string;
  date: string;
  message: string;
  /** 그 커밋에서의 파일 경로 (공간 루트 기준) */
  path: string;
  /** A 추가 · M 수정 · D 삭제 · R 이름 바뀜 */
  status: string;
  /** 이름이 바뀐 커밋이면 예전 경로 */
  from?: string;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const BASE_ARGS = [
  "-c", "core.quotepath=false",
  "-c", "core.longpaths=true",
  "-c", "i18n.logOutputEncoding=utf-8",
  "-c", "i18n.commitEncoding=utf-8",
  "-c", "commit.gpgsign=false",
  "-c", "core.safecrlf=false",
];

const REV_RE = /^[0-9a-f]{4,64}$/i;

/** 사용자 입력 리비전은 16진 해시만 받는다 (옵션 주입 방지) */
export function assertRev(rev: unknown): string {
  if (typeof rev !== "string" || !REV_RE.test(rev)) {
    throw new StoreError("bad_request", "리비전 형식이 올바르지 않습니다.");
  }
  return rev.toLowerCase();
}

/** 커밋 메시지·이름에 들어갈 문자열 정리 (줄바꿈·꺾쇠 제거) */
export function cleanIdent(s: string, fallback: string): string {
  const v = String(s ?? "")
    .replace(/[<>\r\n\u0000]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return v || fallback;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Git {
  /** dir: 공간 루트(이 폴더 기준 상대 경로를 받는다) */
  readonly dir: string;
  private readonly opts: GitOptions;
  private top: string | null = null;
  private prefix = "";

  constructor(dir: string, opts: GitOptions) {
    this.dir = path.resolve(/*turbopackIgnore: true*/ dir);
    this.opts = opts;
  }

  /** 저장소 최상위를 찾는다. git 저장소가 아니면 false */
  async ready(): Promise<boolean> {
    if (this.top) return true;
    if (!fs.existsSync(this.dir)) return false;
    const r = await this.raw(this.dir, ["rev-parse", "--show-toplevel"], { allowFail: true });
    if (r.code !== 0) return false;
    const top = path.resolve(/*turbopackIgnore: true*/ r.stdout.trim());
    const realTop = fs.realpathSync(top);
    const realDir = fs.realpathSync(this.dir);
    if (this.opts.ownRoot && realTop !== realDir) return false;
    this.top = top;
    this.prefix = realDir === realTop ? "" : toPosix(path.relative(realTop, realDir)) + "/";
    return true;
  }

  async ensureRepo(): Promise<void> {
    if (await this.ready()) return;
    fs.mkdirSync(this.dir, { recursive: true });
    await this.raw(this.dir, ["init", "-q"]);
    // 부원 공간처럼 우리가 만든 저장소는 줄바꿈 변환을 끈다 (언제나 \n)
    await this.raw(this.dir, ["config", "core.autocrlf", "false"]);
    await this.raw(this.dir, ["commit", "-q", "--allow-empty", "--no-verify", "-m", "init :: 저장소 만듦"]);
    this.top = null;
    if (!(await this.ready())) {
      throw new StoreError("git_failed", "git 저장소를 만들지 못했습니다.");
    }
  }

  /** 공간 기준 경로 → 최상위 기준 경로 */
  private toTop(rel: string): string {
    return this.prefix + rel;
  }

  /** 최상위 기준 경로 → 공간 기준 경로 (공간 밖이면 null) */
  private fromTop(p: string): string | null {
    if (!this.prefix) return p;
    return p.startsWith(this.prefix) ? p.slice(this.prefix.length) : null;
  }

  async run(args: string[], extra?: { env?: Record<string, string>; allowFail?: boolean; timeoutMs?: number }): Promise<RunResult> {
    if (!(await this.ready())) {
      throw new StoreError("unavailable", `git 저장소가 아닙니다: ${this.dir}`);
    }
    return this.raw(this.top!, args, extra);
  }

  private async raw(
    cwd: string,
    args: string[],
    extra: { env?: Record<string, string>; allowFail?: boolean; timeoutMs?: number } = {}
  ): Promise<RunResult> {
    for (let attempt = 0; ; attempt++) {
      const r = await spawnGit(this.opts.bin, cwd, [...BASE_ARGS, ...args], {
        ...gitEnv(this.opts.committer),
        ...extra.env,
      }, extra.timeoutMs ?? 30_000);
      // 다른 git 이 index.lock 을 잡고 있으면 잠깐 기다렸다 다시
      if (r.code !== 0 && /index\.lock/.test(r.stderr) && attempt < 5) {
        await sleep(200 * (attempt + 1));
        continue;
      }
      if (r.code !== 0 && !extra.allowFail) {
        throw new StoreError("git_failed", `git ${args[0]} 실패: ${r.stderr.trim() || r.stdout.trim()}`, {
          args: args.slice(0, 2),
        });
      }
      return r;
    }
  }

  /**
   * 주어진 경로들만 커밋한다 (작업 폴더의 다른 변경은 건드리지 않음).
   * 바뀐 게 없으면 null.
   */
  async commit(relPaths: string[], subject: string, author: GitIdentity, body?: string): Promise<string | null> {
    const paths = relPaths.map((p) => this.toTop(p));
    await this.run(["add", "-A", "--", ...paths]);
    const st = await this.run(["status", "--porcelain", "--", ...paths]);
    if (!st.stdout.trim()) return null;
    const msg = ["-m", subject];
    if (body && body.trim()) msg.push("-m", body.trim().slice(0, 2000));
    await this.run(["commit", "-q", "--no-verify", ...msg, "--", ...paths], {
      env: {
        GIT_AUTHOR_NAME: cleanIdent(author.name, "익명"),
        GIT_AUTHOR_EMAIL: cleanIdent(author.email, "unknown@offair.local"),
      },
    });
    return (await this.run(["rev-parse", "HEAD"])).stdout.trim();
  }

  /** 파일 이력 (이름 바뀜 따라감). 저장소가 아니면 빈 배열 */
  async log(relPath: string, limit = 100): Promise<HistoryEntry[]> {
    if (!(await this.ready())) return [];
    const r = await this.run(
      [
        "log", "--follow", "-M", "--name-status",
        `--max-count=${Math.max(1, Math.min(limit, 1000))}`,
        "--format=%x1e%H%x1f%an%x1f%aI%x1f%s",
        "--", this.toTop(relPath),
      ],
      { allowFail: true }
    );
    if (r.code !== 0) return [];
    return this.parseLog(r.stdout);
  }

  async lastCommit(relPath: string): Promise<HistoryEntry | null> {
    if (!(await this.ready())) return null;
    const r = await this.run(
      ["log", "-1", "--name-status", "--format=%x1e%H%x1f%an%x1f%aI%x1f%s", "--", this.toTop(relPath)],
      { allowFail: true }
    );
    if (r.code !== 0) return null;
    return this.parseLog(r.stdout)[0] ?? null;
  }

  /** 폴더 아래에서 지워진 파일들 (최근 것 먼저) */
  async deletedUnder(relDir: string, limit = 200): Promise<HistoryEntry[]> {
    if (!(await this.ready())) return [];
    const r = await this.run(
      [
        "log", "--diff-filter=D", "--name-status", `--max-count=${limit}`,
        "--format=%x1e%H%x1f%an%x1f%aI%x1f%s",
        "--", this.toTop(relDir),
      ],
      { allowFail: true }
    );
    if (r.code !== 0) return [];
    return this.parseLog(r.stdout, true);
  }

  /** 리비전에서의 파일 내용. 없으면 null */
  async show(rev: string, relPath: string): Promise<string | null> {
    const r = await this.run(["show", `${assertRev(rev)}:${this.toTop(relPath)}`], { allowFail: true });
    return r.code === 0 ? r.stdout : null;
  }

  /** 짧은 해시 → 전체 커밋 해시. 없으면 null */
  async resolveCommit(rev: string): Promise<string | null> {
    const r = await this.run(["rev-parse", "--verify", "--quiet", `${assertRev(rev)}^{commit}`], { allowFail: true });
    return r.code === 0 ? r.stdout.trim() : null;
  }

  async currentBranch(): Promise<string> {
    return (await this.run(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
  }

  private parseLog(out: string, all = false): HistoryEntry[] {
    const entries: HistoryEntry[] = [];
    for (const chunk of out.split("\x1e")) {
      if (!chunk.trim()) continue;
      const nl = chunk.indexOf("\n");
      const head = nl === -1 ? chunk : chunk.slice(0, nl);
      const rest = nl === -1 ? "" : chunk.slice(nl + 1);
      const [rev, author, date, message] = head.split("\x1f");
      const lines = rest.split("\n").map((l) => l.trim()).filter(Boolean);
      const statusLines = lines.length ? lines : [""];
      for (const line of all ? statusLines : statusLines.slice(0, 1)) {
        const f = line.split("\t");
        const status = (f[0] || "").charAt(0) || "?";
        const p = this.fromTop(f[f.length - 1] || "") ?? "";
        const from = status === "R" && f.length >= 3 ? this.fromTop(f[1]) ?? undefined : undefined;
        entries.push({ rev, shortRev: rev.slice(0, 7), author, date, message, path: p, status, ...(from ? { from } : {}) });
      }
    }
    return entries;
  }
}

function gitEnv(committer: GitIdentity): Record<string, string> {
  return {
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    GIT_COMMITTER_NAME: committer.name,
    GIT_COMMITTER_EMAIL: committer.email,
    // 작성자를 따로 안 주면 커미터와 같게
    GIT_AUTHOR_NAME: committer.name,
    GIT_AUTHOR_EMAIL: committer.email,
  };
}

function spawnGit(
  bin: string,
  cwd: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs: number
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
      shell: false,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let done = false;
    const timer = setTimeout(() => {
      if (!done) child.kill();
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => err.push(d));
    child.on("error", (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout: "", stderr: `git 실행 실패: ${e.message}` });
    });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
  });
}
