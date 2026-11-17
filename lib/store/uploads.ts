import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { StoreError } from "./errors";
import { joinInside, parseRelFile, slugify } from "./paths";
import type { Actor, Space } from "./space";

/**
 * 업로드 — 공개 공간은 public/uploads/<yyyy-mm>/… 에 두고 공개 저장소에 커밋,
 * 부원 공간은 <data>/members/uploads/<yyyy-mm>/… 에 두고 부원 저장소에 커밋한다.
 * 올린 기록(누가·언제·원래 이름·어느 문서·그림 크기)은 <data>/uploads/<space>.jsonl 에 한 줄씩.
 *
 * 표시 달기(ImageAnnotator) 보조 파일 — 본 그림 `이름.webp` 옆에
 *   `이름.base.webp`  가리기·자르기만 한 바탕 그림 (다시 고칠 때 쓴다)
 *   `이름.marks.json` 표시 정보(사이드카)
 * 를 둔다. 올릴 때 `of`(본 그림 주소)를 주면 본 그림 이름에 맞춰 같은 폴더에 쓰고, 같은 이름이면 덮어쓴다.
 * 목록에서는 숨기고 본 그림에 `sidecarUrl` 로 붙인다.
 */

export const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

/** SVG·HTML 처럼 스크립트를 품을 수 있는 형식은 받지 않는다 */
export const FILE_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".zip": "application/zip",
  ".hwp": "application/x-hwp",
  ".hwpx": "application/hwp+zip",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

export const ALLOWED_EXT = [...Object.keys(IMAGE_TYPES), ...Object.keys(FILE_TYPES)];

export function mimeOf(name: string): string {
  if (/\.marks\.json$/i.test(name)) return "application/json";
  const ext = path.extname(name).toLowerCase();
  return IMAGE_TYPES[ext] ?? FILE_TYPES[ext] ?? "application/octet-stream";
}

export function isImage(name: string): boolean {
  return path.extname(name).toLowerCase() in IMAGE_TYPES;
}

/** 표시 달기 보조 파일 이름인가 (`이름.base.webp`, `이름.marks.json`) */
export function isAuxName(name: string): boolean {
  return /\.base\.[a-z0-9]+$/i.test(name) || /\.marks\.json$/i.test(name);
}

/** 사이드카(.marks.json) 는 읽기·쓰기에서만 .json 을 받는다 */
const READ_EXT = [...ALLOWED_EXT, ".json"];
const MAX_SIDECAR_BYTES = 512 * 1024;

function stemOf(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/** 확장자와 실제 내용(앞 몇 바이트)이 맞는지 — 이미지만 확인 */
function sniffImage(ext: string, b: Buffer): boolean {
  const hex = b.subarray(0, 12).toString("hex");
  switch (ext) {
    case ".png":
      return hex.startsWith("89504e470d0a1a0a");
    case ".jpg":
    case ".jpeg":
      return hex.startsWith("ffd8ff");
    case ".gif":
      return hex.startsWith("47494638");
    case ".webp":
      return hex.startsWith("52494646") && b.subarray(8, 12).toString("ascii") === "WEBP";
    case ".avif":
      return b.subarray(4, 12).toString("ascii").startsWith("ftypavi");
    default:
      return false;
  }
}

export interface UploadInput {
  name: string;
  bytes: Buffer;
  /** 어느 문서에 붙이려는지 (기록용) */
  doc?: string | null;
  /** 표시 달기 보조 파일이면 본 그림 주소 (그 옆에 이름을 맞춰 둔다) */
  of?: string | null;
  /** 브라우저가 아는 그림 크기 (목록에 보여 준다) */
  width?: number | null;
  height?: number | null;
}

export interface UploadResult {
  space: string;
  /** 공간 루트 기준 경로 */
  path: string;
  url: string;
  /** 사람이 고른 원래 이름 */
  name: string;
  /** 저장된 파일 이름 (보조 파일 이름을 맞출 때 쓴다) */
  fileName: string;
  size: number;
  type: string;
  image: boolean;
  commit: string | null;
}

export function checkUpload(space: Space, input: UploadInput): { ext: string; image: boolean } {
  const name = String(input.name ?? "").trim();
  const ext = path.extname(name).toLowerCase();
  if (!name || !ALLOWED_EXT.includes(ext)) {
    throw new StoreError("unsupported_type", `올릴 수 없는 파일 형식입니다: ${ext || "(확장자 없음)"}`, {
      allowed: ALLOWED_EXT,
    });
  }
  const image = ext in IMAGE_TYPES;
  const limit = image ? space.layout.upload.maxImageBytes : space.layout.upload.maxFileBytes;
  if (input.bytes.length === 0) throw new StoreError("bad_request", "빈 파일입니다.");
  if (input.bytes.length > limit) {
    throw new StoreError("too_large", `파일이 너무 큽니다 (최대 ${Math.round(limit / 1024 / 1024)}MB).`, {
      limit,
    });
  }
  if (image && !sniffImage(ext, input.bytes)) {
    throw new StoreError("unsupported_type", "확장자와 파일 내용이 맞지 않습니다.");
  }
  return { ext, image };
}

/** 공간 업로드 주소(`/uploads/2026-11/a.webp`) → [월, 파일 이름]. 이 공간 것이 아니면 null */
export function parseUploadUrl(space: Space, url: string): [string, string] | null {
  const prefix = space.layout.uploadsUrl + "/";
  let p = String(url ?? "");
  try {
    p = new URL(p, "http://x").pathname;
  } catch {
    return null;
  }
  if (!p.startsWith(prefix)) return null;
  const parts = p.slice(prefix.length).split("/");
  if (parts.length !== 2 || !/^\d{4}-\d{2}$/.test(parts[0])) return null;
  try {
    return [parts[0], decodeURIComponent(parts[1])];
  } catch {
    return null;
  }
}

/**
 * 보조 파일을 둘 자리. 본 그림이 이 공간에 실제로 있어야 하고, 이름은 본 그림에 맞춘다
 * (`a-1f2e3d.webp` → `a-1f2e3d.base.webp` / `a-1f2e3d.marks.json`).
 */
function auxTarget(space: Space, input: UploadInput): { month: string; fileName: string; ext: string; image: boolean } {
  const main = parseUploadUrl(space, String(input.of ?? ""));
  if (!main) throw new StoreError("bad_request", "본 그림 주소(of)가 이 공간의 업로드가 아닙니다.");
  const [month, mainName] = main;
  if (!isImage(mainName) || isAuxName(mainName)) throw new StoreError("bad_request", "본 그림이 그림 파일이 아닙니다.");
  if (!readUpload(space, [month, mainName])) throw new StoreError("not_found", "본 그림을 찾을 수 없습니다.");
  const name = String(input.name ?? "");
  if (/\.marks\.json$/i.test(name)) {
    if (input.bytes.length === 0 || input.bytes.length > MAX_SIDECAR_BYTES) {
      throw new StoreError("too_large", "표시 정보 파일이 너무 큽니다.");
    }
    try {
      const j = JSON.parse(input.bytes.toString("utf8"));
      if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("not object");
    } catch {
      throw new StoreError("bad_request", "표시 정보(JSON)를 읽을 수 없습니다.");
    }
    return { month, fileName: `${stemOf(mainName)}.marks.json`, ext: ".json", image: false };
  }
  const m = /\.base(\.[a-z0-9]+)$/i.exec(name);
  if (!m) throw new StoreError("bad_request", "보조 파일 이름은 `이름.base.<확장자>` 또는 `이름.marks.json` 이어야 합니다.");
  const { ext } = checkUpload(space, { ...input, name: `base${m[1]}` });
  if (!(ext in IMAGE_TYPES)) throw new StoreError("unsupported_type", "바탕 그림은 그림 파일이어야 합니다.");
  return { month, fileName: `${stemOf(mainName)}.base${ext}`, ext, image: true };
}

export async function saveUpload(
  space: Space,
  dataDir: string,
  input: UploadInput,
  actor: Actor,
  now = new Date()
): Promise<UploadResult> {
  let month: string;
  let fileName: string;
  let image: boolean;
  if (input.of) {
    ({ month, fileName, image } = auxTarget(space, input));
  } else {
    if (isAuxName(String(input.name ?? ""))) {
      throw new StoreError("bad_request", "표시 달기 보조 파일은 본 그림 주소(of)와 함께 올립니다.");
    }
    const checked = checkUpload(space, input);
    image = checked.image;
    month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const base = slugify(path.basename(input.name, path.extname(input.name))).slice(0, 60) || "file";
    fileName = `${base}-${crypto.randomBytes(3).toString("hex")}${checked.ext}`;
  }
  const rel = `${space.layout.uploadsDir}/${month}/${fileName}`;
  parseRelFile(rel, READ_EXT);

  const commit = await space.withLock(() =>
    space.applyChanges(
      [{ rel, data: input.bytes }],
      input.of
        ? `docs :: 그림 표시 「${fileName.slice(0, 80)}」 저장`
        : `docs :: 파일 「${path.basename(input.name).slice(0, 80)}」 올림`,
      actor
    )
  );

  const url = `${space.layout.uploadsUrl}/${month}/${encodeURIComponent(fileName)}`;
  const result: UploadResult = {
    space: space.id,
    path: rel,
    url,
    name: input.of ? fileName : path.basename(input.name),
    fileName,
    size: input.bytes.length,
    type: mimeOf(fileName),
    image,
    commit,
  };
  const dim = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 && n < 100000 ? Math.round(n) : null);
  // 기록은 실패해도 업로드를 되돌리지 않는다
  try {
    const logDir = path.join(dataDir, "uploads");
    await fsp.mkdir(logDir, { recursive: true });
    await fsp.appendFile(
      path.join(logDir, `${space.id}.jsonl`),
      JSON.stringify({
        ...result,
        doc: input.doc ?? null,
        of: input.of ?? null,
        width: dim(input.width),
        height: dim(input.height),
        uploader: { name: actor.name, memberId: actor.memberId ?? null },
        at: now.toISOString(),
      }) + "\n",
      "utf8"
    );
  } catch (e) {
    console.warn("[offair] 업로드 기록 실패:", (e as Error).message);
  }
  return result;
}

/** 업로드 폴더 안의 파일을 읽는다 (부원 파일 제공·공개 업로드 대체 경로용) */
export function readUpload(space: Space, parts: string[]): { bytes: Buffer; type: string; name: string; image: boolean } | null {
  const decoded = parts.map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      throw new StoreError("bad_path", "경로를 읽을 수 없습니다.");
    }
  });
  const relParts = parseRelFile(decoded.join("/"), READ_EXT);
  if (relParts[relParts.length - 1].toLowerCase().endsWith(".json") && !/\.marks\.json$/i.test(relParts[relParts.length - 1])) {
    throw new StoreError("bad_path", "허용되지 않는 확장자입니다: .json");
  }
  const uploadsRoot = joinInside(space.layout.root, space.layout.uploadsDir.split("/"));
  const abs = joinInside(uploadsRoot, relParts);
  let st: fs.Stats;
  try {
    st = fs.statSync(abs);
  } catch {
    return null;
  }
  if (!st.isFile()) return null;
  const name = relParts[relParts.length - 1];
  return { bytes: fs.readFileSync(abs), type: mimeOf(name), name, image: isImage(name) };
}

/* ───────────────────────── 목록 ───────────────────────── */

export interface UploadListItem {
  url: string;
  /** 원래 이름 (기록이 없으면 저장된 이름) */
  name: string;
  fileName: string;
  size: number;
  kind: "image" | "file";
  type: string;
  width?: number;
  height?: number;
  /** 올린 문서 (기록됐으면) */
  doc?: string;
  uploadedAt: string;
  /** 표시 달기 사이드카 주소 */
  sidecarUrl?: string;
}

interface LogLine {
  path?: string;
  name?: string;
  doc?: string | null;
  width?: number | null;
  height?: number | null;
  at?: string;
}

function readLog(dataDir: string, space: Space): Map<string, LogLine> {
  const out = new Map<string, LogLine>();
  const file = path.join(dataDir, "uploads", `${space.id}.jsonl`);
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line) as LogLine;
      // 같은 경로가 또 나오면(보조 파일 덮어쓰기) 처음 기록을 둔다 — 원래 이름·문서가 거기 있다
      if (j.path && !out.has(j.path)) out.set(j.path, j);
    } catch {
      /* 깨진 줄은 건너뛴다 */
    }
  }
  return out;
}

/**
 * 이 공간에 올린 파일 (최근 것 먼저). 보조 파일은 숨기고 본 그림에 sidecarUrl 로 붙인다.
 * doc 을 주면 그 문서에서 올린 것만 (기록이 있는 것), q 는 이름 검색.
 */
export function listUploads(space: Space, dataDir: string, opts: { doc?: string | null; q?: string | null; limit?: number } = {}): UploadListItem[] {
  const root = joinInside(space.layout.root, space.layout.uploadsDir.split("/"));
  if (!fs.existsSync(root)) return [];
  const log = readLog(dataDir, space);
  const q = String(opts.q ?? "").trim().toLowerCase();
  const out: UploadListItem[] = [];
  for (const month of fs.readdirSync(root)) {
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const dir = path.join(root, month);
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const all = new Set(names);
    for (const fileName of names) {
      if (fileName.startsWith(".") || isAuxName(fileName)) continue;
      const ext = path.extname(fileName).toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) continue;
      let st: fs.Stats;
      try {
        st = fs.statSync(path.join(dir, fileName));
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      const rel = `${space.layout.uploadsDir}/${month}/${fileName}`;
      const meta = log.get(rel);
      if (opts.doc && meta?.doc !== opts.doc) continue;
      const name = meta?.name || fileName;
      if (q && !name.toLowerCase().includes(q) && !fileName.toLowerCase().includes(q)) continue;
      const sc = `${stemOf(fileName)}.marks.json`;
      out.push({
        url: `${space.layout.uploadsUrl}/${month}/${encodeURIComponent(fileName)}`,
        name,
        fileName,
        size: st.size,
        kind: ext in IMAGE_TYPES ? "image" : "file",
        type: mimeOf(fileName),
        ...(meta?.width ? { width: meta.width } : {}),
        ...(meta?.height ? { height: meta.height } : {}),
        ...(meta?.doc ? { doc: meta.doc } : {}),
        uploadedAt: meta?.at || st.mtime.toISOString(),
        ...(all.has(sc) ? { sidecarUrl: `${space.layout.uploadsUrl}/${month}/${encodeURIComponent(sc)}` } : {}),
      });
    }
  }
  out.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return out.slice(0, opts.limit ?? 500);
}
