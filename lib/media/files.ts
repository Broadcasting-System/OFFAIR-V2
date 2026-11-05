/**
 * 올릴 수 있는 파일 — 허용 목록과 크기 제한.
 * 서버(개발용 어댑터·나중 백엔드)도 같은 표를 써서 한 번 더 검사한다.
 */

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB
/** 그림 원본은 줄이기 전이라 조금 더 크게 받아 준다 (줄인 뒤 25MB 검사) */
export const MAX_IMAGE_INPUT_BYTES = 60 * 1024 * 1024;

/** 그림 (브라우저에서 줄여 올림). SVG 는 스크립트가 숨을 수 있어 받지 않는다. */
export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/** 그림이 아닌 파일 (그대로 올림) */
export const FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  json: "application/json",
  zip: "application/zip",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  hwp: "application/x-hwp",
  hwpx: "application/hwp+zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
};

export function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isImageName(name: string): boolean {
  return extOf(name) in IMAGE_TYPES;
}

export function mimeFor(name: string): string {
  const e = extOf(name);
  return IMAGE_TYPES[e] ?? FILE_TYPES[e] ?? "application/octet-stream";
}

/** <input type=file accept> 값 */
export const ACCEPT_ATTR = [...Object.keys(IMAGE_TYPES), ...Object.keys(FILE_TYPES)]
  .map((e) => "." + e)
  .join(",");

export type FileCheck =
  | { ok: true; kind: "image" | "file" }
  | { ok: false; reason: string };

/** 고른 파일을 받을 수 있는지 (원본 기준). */
export function checkFile(f: { name: string; size: number; type?: string }): FileCheck {
  const e = extOf(f.name);
  if (e === "heic" || e === "heif") {
    return { ok: false, reason: "HEIC 그림은 아직 못 올려요. JPG·PNG 로 바꿔 주세요" };
  }
  if (e === "svg") return { ok: false, reason: "SVG 는 올릴 수 없어요. PNG 로 바꿔 주세요" };
  if (e in IMAGE_TYPES) {
    if (f.size > MAX_IMAGE_INPUT_BYTES) return { ok: false, reason: "그림이 너무 커요 (60MB 까지)" };
    return { ok: true, kind: "image" };
  }
  if (e in FILE_TYPES) {
    if (f.size > MAX_FILE_BYTES) return { ok: false, reason: "파일이 너무 커요 (25MB 까지)" };
    return { ok: true, kind: "file" };
  }
  return { ok: false, reason: `.${e || "?"} 파일은 올릴 수 없어요` };
}

/** 서버 쪽 최종 검사 (줄인 뒤의 파일) */
export function checkUpload(name: string, size: number): string | null {
  const e = extOf(name);
  if (!(e in IMAGE_TYPES) && !(e in FILE_TYPES) && !name.endsWith(".marks.json")) {
    return `.${e || "?"} 파일은 올릴 수 없어요`;
  }
  if (size > MAX_FILE_BYTES) return "파일이 너무 커요 (25MB 까지)";
  return null;
}

/** 파일 종류 짧은 이름 (아이콘 자리) */
export function badgeFor(name: string): string {
  const e = extOf(name);
  return e ? e.toUpperCase().slice(0, 4) : "FILE";
}

/* 표시 달기 결과물 이름 규칙 — 목록에서 base·사이드카를 숨기고 이어 붙이는 데 쓴다 */

/** 시보.webp → 시보.base.webp */
export function baseNameFor(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}.base${name.slice(dot)}` : `${name}.base`;
}

/** 시보.webp → 시보.marks.json */
export function sidecarNameFor(name: string): string {
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.marks.json`;
}

export function isAuxName(name: string): boolean {
  return /\.base\.[a-z0-9]+$/i.test(name) || name.endsWith(".marks.json");
}
