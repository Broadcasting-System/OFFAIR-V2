"use server";

/**
 * 개발용 문서 저장소 어댑터 (lib/editor/wiki-client.ts 의 devAdapter 가 부른다).
 *
 * - NODE_ENV === 'production' 이면 아무것도 하지 않는다 (배포본에선 잠김).
 * - 문서: content/<path>.mdx 를 직접 읽고 쓴다. rev = 파일 내용 sha1.
 * - 파일: public/uploads/dev/ 에 올린다 (git 에 안 올라가게 .gitignore).
 *
 * TODO(백엔드 연결): feat/wiki-backend 의 저장·git·권한 API 로 바뀌면 이 파일은 지운다.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { compile } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import { revalidatePath } from "next/cache";
import { parseFrontmatter, splitFrontmatter } from "@/lib/editor/frontmatter";
import type { SaveResult, WikiDoc } from "@/lib/editor/wiki-client";

const IS_DEV = process.env.NODE_ENV !== "production";
const CONTENT_DIR = path.join(process.cwd(), "content");
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "dev");
const SPACES: Record<string, string> = { guide: CONTENT_DIR };

function resolveDoc(space: string, docPath: string): string {
  const root = SPACES[space];
  if (!root) throw new Error(`모르는 문서 묶음: ${space}`);
  const cleaned = docPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\.mdx$/, "");
  if (!cleaned || cleaned.split("/").some((seg) => !seg || seg === "." || seg === "..")) {
    throw new Error("잘못된 문서 경로");
  }
  const full = path.normalize(path.join(root, cleaned + ".mdx"));
  if (!full.startsWith(root + path.sep)) throw new Error("문서 경로가 content/ 밖을 가리킵니다");
  return full;
}

const sha1 = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);

function toMeta(mdx: string): WikiDoc["meta"] {
  const m = parseFrontmatter(splitFrontmatter(mdx).yaml);
  return { title: m.title, description: m.description, category: m.category, order: m.order };
}

export async function devGetDoc(space: string, docPath: string): Promise<WikiDoc | null> {
  if (!IS_DEV) return null;
  const full = resolveDoc(space, docPath);
  if (!fs.existsSync(full)) return null;
  const mdx = await fsp.readFile(full, "utf8");
  return { mdx, rev: sha1(mdx), meta: toMeta(mdx) };
}

export async function devSaveDoc(
  space: string,
  docPath: string,
  mdx: string,
  baseRev: string | null,
): Promise<SaveResult> {
  if (!IS_DEV) return { ok: false, error: "개발 환경에서만 저장할 수 있습니다." };
  try {
    const full = resolveDoc(space, docPath);
    const exists = fs.existsSync(full);
    const current = exists ? await fsp.readFile(full, "utf8") : null;
    const currentRev = current == null ? null : sha1(current);
    if (currentRev !== baseRev) {
      return { ok: false, conflict: true, rev: currentRev, mdx: current ?? "" };
    }
    // 사이트 렌더러와 같은 설정으로 한 번 컴파일해 본다 — 깨진 MDX 는 저장하지 않는다
    try {
      await compile(splitFrontmatter(mdx).body, { remarkPlugins: [remarkGfm] });
    } catch (e) {
      return { ok: false, error: `MDX 오류: ${e instanceof Error ? e.message : String(e)}` };
    }
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, mdx, "utf8");
    revalidatePath("/", "layout");
    return { ok: true, rev: sha1(mdx) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const MAX_UPLOAD = 10 * 1024 * 1024;

export async function devUploadFile(
  space: string,
  form: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!IS_DEV) return { ok: false, error: "개발 환경에서만 올릴 수 있습니다." };
  if (!SPACES[space]) return { ok: false, error: `모르는 문서 묶음: ${space}` };
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "파일이 없습니다." };
  if (file.size > MAX_UPLOAD) return { ok: false, error: "10MB 보다 큰 파일은 올릴 수 없습니다." };
  const ext = (path.extname(file.name) || "").toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const base = path
    .basename(file.name, path.extname(file.name))
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "file";
  const name = `${Date.now().toString(36)}-${base}${ext}`;
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  await fsp.writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  return { ok: true, url: `/uploads/dev/${encodeURIComponent(name)}` };
}

/** 새 문서 경로 정하기 — 제목으로 docs/<slug>, 겹치면 -2, -3 … */
export async function devSuggestPath(space: string, title: string): Promise<string> {
  const root = SPACES[space] ?? CONTENT_DIR;
  const base =
    title
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "") || "doc";
  let slug = base;
  let n = 2;
  while (fs.existsSync(path.join(root, "docs", `${slug}.mdx`))) slug = `${base}-${n++}`;
  return `docs/${slug}`;
}
