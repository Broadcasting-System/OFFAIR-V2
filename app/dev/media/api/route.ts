/**
 * 개발용 미디어 어댑터 — `npm run dev` 에서만 동작, 프로덕션에서는 404.
 *
 *   GET  ?space=guide&doc=onair/time&q=시보   → { files: FileInfo[] }
 *   POST form(space, file, doc?, width?, height?) → UploadResult
 *
 * public/uploads/dev/<space>/ 에 파일을 쓰고, 같은 폴더의 _index.json 에
 * 올린 문서·크기 같은 정보를 적는다.
 *
 * TODO(wiki-backend): 진짜 업로드 API 가 생기면 lib/media/client.ts 의
 *   defaultMediaClient 를 그쪽으로 바꾸고 이 파일은 지운다.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { checkUpload, extOf, isAuxName, isImageName, mimeFor, sidecarNameFor } from "@/lib/media/files";
import type { FileInfo } from "@/lib/media/types";

const IS_DEV = process.env.NODE_ENV !== "production";
const ROOT = path.join(process.cwd(), "public", "uploads", "dev");
const PUBLIC_PREFIX = "/uploads/dev";

interface IndexEntry {
  size: number;
  type: string;
  width?: number;
  height?: number;
  doc?: string;
  uploadedAt: string;
}
type Index = Record<string, IndexEntry>;

/** _index.json 고치기를 한 줄로 세운다 — 동시에 올리면 서로 덮어써 기록이 사라지던 문제 */
let indexLock: Promise<unknown> = Promise.resolve();
function withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = indexLock.then(fn, fn);
  indexLock = run.catch(() => undefined);
  return run;
}

/** 임시 파일에 쓰고 이름 바꾸기 — 읽는 쪽이 반쯤 쓴 JSON 을 보지 않게 */
async function writeIndex(dir: string, index: Index) {
  const tmp = path.join(dir, `_index.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(index, null, 2));
  await fs.rename(tmp, path.join(dir, "_index.json"));
}

function notFound() {
  return new Response("Not Found", { status: 404 });
}

function spaceDir(space: string | null): string | null {
  if (!space || !/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(space)) return null;
  return path.join(ROOT, space);
}

async function readIndex(dir: string): Promise<Index> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, "_index.json"), "utf8")) as Index;
  } catch {
    return {};
  }
}

/** 파일 이름 정리 — 글자·숫자·.-_ 만, 경로 조각은 버린다 */
function cleanName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const s = base
    .normalize("NFC")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}._-]+/gu, "")
    .replace(/^\.+/, "")
    .slice(-120);
  return s || "file";
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** 겹치면 이름-1.ext, 이름-2.ext … (보조 파일은 덮어씀) */
async function uniqueName(dir: string, name: string): Promise<string> {
  if (isAuxName(name) || !(await exists(path.join(dir, name)))) return name;
  const ext = extOf(name);
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  for (let i = 1; i < 1000; i++) {
    const n = `${stem}-${i}${ext ? "." + ext : ""}`;
    if (!(await exists(path.join(dir, n)))) return n;
  }
  return `${stem}-${Date.now()}${ext ? "." + ext : ""}`;
}

function urlFor(space: string, name: string): string {
  return `${PUBLIC_PREFIX}/${space}/${encodeURIComponent(name)}`;
}

export async function GET(request: Request) {
  if (!IS_DEV) return notFound();
  const { searchParams } = new URL(request.url);
  const space = searchParams.get("space");
  const dir = spaceDir(space);
  if (!dir || !space) return Response.json({ error: "space 가 이상해요" }, { status: 400 });
  const doc = searchParams.get("doc") || undefined;
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return Response.json({ files: [] });
  }
  const index = await readIndex(dir);
  const all = new Set(names);
  const files: FileInfo[] = [];
  for (const name of names) {
    if (name.startsWith("_") || name.startsWith(".") || isAuxName(name)) continue;
    const meta = index[name];
    let size = meta?.size;
    let uploadedAt = meta?.uploadedAt;
    if (size == null || !uploadedAt) {
      const st = await fs.stat(path.join(dir, name)).catch(() => null);
      if (!st?.isFile()) continue;
      size = st.size;
      uploadedAt = st.mtime.toISOString();
    }
    if (doc && meta?.doc !== doc) continue;
    if (q && !name.toLowerCase().includes(q)) continue;
    const sc = sidecarNameFor(name);
    files.push({
      url: urlFor(space, name),
      name,
      size,
      kind: isImageName(name) ? "image" : "file",
      type: meta?.type ?? mimeFor(name),
      width: meta?.width,
      height: meta?.height,
      doc: meta?.doc,
      uploadedAt,
      sidecarUrl: all.has(sc) ? urlFor(space, sc) : undefined,
    });
  }
  files.sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));
  return Response.json({ files });
}

export async function POST(request: Request) {
  if (!IS_DEV) return notFound();
  const form = await request.formData();
  const space = String(form.get("space") ?? "");
  const dir = spaceDir(space);
  if (!dir) return Response.json({ error: "space 가 이상해요" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "파일이 없어요" }, { status: 400 });

  const wanted = cleanName(file.name);
  const problem = checkUpload(wanted, file.size);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  await fs.mkdir(dir, { recursive: true });
  const width = Number(form.get("width")) || undefined;
  const height = Number(form.get("height")) || undefined;
  const doc = form.get("doc") ? String(form.get("doc")) : undefined;
  const bytes = Buffer.from(await file.arrayBuffer());

  // 이름 고르기·쓰기·목록 기록을 한 번에 (겹친 이름 고르기도 경쟁하지 않게)
  const name = await withIndexLock(async () => {
    const n = await uniqueName(dir, wanted);
    await fs.writeFile(path.join(dir, n), bytes);
    const index = await readIndex(dir);
    index[n] = {
      size: file.size,
      type: file.type || mimeFor(n),
      width,
      height,
      doc,
      uploadedAt: new Date().toISOString(),
    };
    await writeIndex(dir, index);
    return n;
  });

  return Response.json({ url: urlFor(space, name), name, size: file.size, width, height });
}
