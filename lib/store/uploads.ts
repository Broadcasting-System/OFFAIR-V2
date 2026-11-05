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
 * 올린 기록(누가·언제·원래 이름)은 <data>/uploads/<space>.jsonl 에 한 줄씩.
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
  const ext = path.extname(name).toLowerCase();
  return IMAGE_TYPES[ext] ?? FILE_TYPES[ext] ?? "application/octet-stream";
}

export function isImage(name: string): boolean {
  return path.extname(name).toLowerCase() in IMAGE_TYPES;
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
}

export interface UploadResult {
  space: string;
  /** 공간 루트 기준 경로 */
  path: string;
  url: string;
  name: string;
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

export async function saveUpload(
  space: Space,
  dataDir: string,
  input: UploadInput,
  actor: Actor,
  now = new Date()
): Promise<UploadResult> {
  const { ext, image } = checkUpload(space, input);
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const base = slugify(path.basename(input.name, path.extname(input.name))).slice(0, 60) || "file";
  const fileName = `${base}-${crypto.randomBytes(3).toString("hex")}${ext}`;
  const rel = `${space.layout.uploadsDir}/${month}/${fileName}`;
  parseRelFile(rel, ALLOWED_EXT);

  const commit = await space.withLock(() =>
    space.applyChanges(
      [{ rel, data: input.bytes }],
      `docs :: 파일 「${path.basename(input.name).slice(0, 80)}」 올림`,
      actor
    )
  );

  const url = `${space.layout.uploadsUrl}/${month}/${encodeURIComponent(fileName)}`;
  const result: UploadResult = {
    space: space.id,
    path: rel,
    url,
    name: path.basename(input.name),
    size: input.bytes.length,
    type: mimeOf(fileName),
    image,
    commit,
  };
  // 기록은 실패해도 업로드를 되돌리지 않는다
  try {
    const logDir = path.join(dataDir, "uploads");
    await fsp.mkdir(logDir, { recursive: true });
    await fsp.appendFile(
      path.join(logDir, `${space.id}.jsonl`),
      JSON.stringify({
        ...result,
        doc: input.doc ?? null,
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
  const relParts = parseRelFile(decoded.join("/"), ALLOWED_EXT);
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
