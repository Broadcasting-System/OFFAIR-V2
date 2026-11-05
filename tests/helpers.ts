import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetStoreForTests } from "@/lib/store";
import { clearAuthCache } from "@/lib/wiki/auth";

/** 임시 공개 저장소 + 데이터 폴더를 만들고 env 를 그쪽으로 돌린다 */
export interface Sandbox {
  dir: string;
  guide: string;
  data: string;
  git: (args: string[], cwd?: string) => string;
  cleanup: () => void;
}

const ENV_KEYS = [
  "OFFAIR_GUIDE_REPO",
  "OFFAIR_DATA_DIR",
  "OFFAIR_READONLY",
  "OFFAIR_GIT_COMMIT",
  "OFFAIR_GIT_PUSH",
  "OFFAIR_GIT_REMOTE",
  "OFFAIR_GIT_BRANCH",
  "OFFAIR_GIT_PUSH_DEBOUNCE_MS",
  "OFFAIR_GIT_BIN",
  "OFFAIR_DEV_ROLE",
  "OFFAIR_DEV_NAME",
  "OFFAIR_DEV_MEMBER_ID",
  "ONAIR_API_BASE",
  "OFFAIR_UPLOAD_MAX_IMAGE_MB",
  "VERCEL",
];

export function doc(fm: Record<string, string | number>, body: string): string {
  const head = Object.entries(fm)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---\n${head}\n---\n\n${body}\n`;
}

export function makeSandbox(env: Record<string, string> = {}): Sandbox {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "offair-test-"));
  const guide = path.join(dir, "guide");
  const data = path.join(dir, "data");
  const git = (args: string[], cwd = guide) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_AUTHOR_NAME: "seed", GIT_AUTHOR_EMAIL: "seed@test", GIT_COMMITTER_NAME: "seed", GIT_COMMITTER_EMAIL: "seed@test" },
    });

  fs.mkdirSync(path.join(guide, "content", "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(guide, "content", "sidebar.json"),
    JSON.stringify({ categories: ["시작하기", "운영"] }, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(guide, "content", "docs", "intro.mdx"),
    doc({ title: "소개", description: "첫 문서", category: "시작하기", order: 1 }, "## 안녕\n\n방송부 가이드입니다.\n\n" + "긴 줄 ".repeat(40))
  );
  fs.writeFileSync(
    path.join(guide, "content", "docs", "rules.mdx"),
    doc({ title: "규칙", description: "", category: "운영", order: 1 }, "## 규칙 하나\n\n<Callout type=\"tip\">마이크는 끄고 나간다</Callout>\n\n" + "규칙 본문 ".repeat(40))
  );
  fs.writeFileSync(path.join(guide, ".gitignore"), "/data\n");
  git(["init", "-q", "-b", "main"]);
  git(["config", "core.autocrlf", "false"]);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "seed"]);

  const prev: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) prev[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.OFFAIR_GUIDE_REPO = guide;
  process.env.OFFAIR_DATA_DIR = data;
  Object.assign(process.env, env);
  resetStoreForTests();
  clearAuthCache();

  return {
    dir,
    guide,
    data,
    git,
    cleanup() {
      for (const k of ENV_KEYS) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
      resetStoreForTests();
      clearAuthCache();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const editor = { name: "김부원", memberId: "m-1" };
export const other = { name: "이부원", memberId: "m-2" };

/* ───────────── ONAIR /api/members/me 흉내 ───────────── */

export const TOKENS: Record<string, { role: string; name: string; memberId: string | null; status?: string }> = {
  "tok-superadmin": { role: "superadmin", name: "관리자", memberId: "m-sa" },
  "tok-lead": { role: "lead", name: "부장", memberId: "m-lead" },
  "tok-member": { role: "member", name: "김부원", memberId: "m-1" },
  "tok-member2": { role: "member", name: "이부원", memberId: "m-2" },
  "tok-alumni": { role: "alumni", name: "졸업생", memberId: "m-al" },
  "tok-teacher": { role: "teacher", name: "선생님", memberId: "m-t" },
  "tok-guest": { role: "guest", name: "모르는 사람", memberId: null },
  "tok-pending": { role: "member", name: "대기", memberId: "m-p", status: "pending" },
};

export interface FetchMock {
  calls: { url: string; token: string | null }[];
  restore: () => void;
}

export function mockOnair(): FetchMock {
  const original = globalThis.fetch;
  const calls: FetchMock["calls"] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers = new Headers(init?.headers);
    const token = headers.get("cf-access-jwt-assertion");
    calls.push({ url, token });
    if (!url.endsWith("/api/members/me")) return new Response("not found", { status: 404 });
    if (token === "tok-down") throw new TypeError("fetch failed");
    const who = token ? TOKENS[token] : undefined;
    const body = who
      ? { status: who.status ?? (who.role === "guest" ? "unregistered" : "approved"), ...who }
      : { status: "unregistered", role: "guest", name: "알 수 없음", memberId: null };
    return Response.json(body);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

export function req(
  method: string,
  url: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string>; form?: FormData } = {}
): Request {
  const headers = new Headers(opts.headers);
  if (opts.token) headers.set("cf-access-jwt-assertion", opts.token);
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opts.body);
  }
  return new Request(new URL(url, "http://wiki.test"), { method, headers, body });
}

export async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

export const PNG_1PX = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c00000000049454e44ae426082",
  "hex"
);
