import fs from "node:fs";
import path from "node:path";
import { StoreError } from "./errors";

/**
 * 경로 안전 규칙. 문서는 언제나 "슬러그 조각 배열"로 다루고,
 * 디스크 경로는 공간 루트 안쪽인지 확인한 뒤에만 만든다.
 *
 * - `..`, `.`, 빈 조각, 절대 경로, 드라이브 문자(`C:`), 백슬래시 거부
 * - Windows 에서 못 쓰는 문자(`<>:"|?*`, 제어 문자)와 예약 이름(CON, NUL, COM1 …) 거부
 * - 끝이 점·공백인 조각 거부 (Windows 가 조용히 잘라 다른 파일이 된다)
 */

export const MAX_DEPTH = 6;
const MAX_SEGMENT = 120;
const WIN_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const BAD_CHARS = /[<>:"|?*\u0000-\u001f\\/]/;

export function assertSegment(seg: string): string {
  if (typeof seg !== "string" || seg.length === 0) {
    throw new StoreError("bad_path", "빈 경로 조각입니다.");
  }
  if (seg === "." || seg === "..") {
    throw new StoreError("bad_path", "상위 폴더 경로는 쓸 수 없습니다.");
  }
  if (seg.length > MAX_SEGMENT) {
    throw new StoreError("bad_path", "경로 조각이 너무 깁니다.");
  }
  if (BAD_CHARS.test(seg)) {
    throw new StoreError("bad_path", `쓸 수 없는 문자가 있습니다: ${seg}`);
  }
  if (/[. ]$/.test(seg) || /^ /.test(seg)) {
    throw new StoreError("bad_path", "앞뒤 공백이나 끝의 점은 쓸 수 없습니다.");
  }
  if (WIN_RESERVED.test(seg)) {
    throw new StoreError("bad_path", `예약된 이름입니다: ${seg}`);
  }
  if (seg.startsWith(".")) {
    throw new StoreError("bad_path", "숨김 파일 이름은 쓸 수 없습니다.");
  }
  return seg;
}

/**
 * 슬러그(문자열 "a/b" 또는 배열 ["a","b"])를 검증된 조각 배열로.
 * `.mdx` 확장자가 붙어 오면 떼어 준다 (그 밖의 확장자는 그냥 이름의 일부로 본다).
 */
export function parseSlug(input: string | string[] | undefined | null): string[] {
  if (input === undefined || input === null) {
    throw new StoreError("bad_path", "문서 경로가 없습니다.");
  }
  let parts: string[];
  if (Array.isArray(input)) {
    parts = input.map(String);
  } else {
    const s = String(input);
    if (s.includes("\\")) throw new StoreError("bad_path", "백슬래시는 쓸 수 없습니다.");
    if (s.startsWith("/") || /^[a-zA-Z]:/.test(s)) {
      throw new StoreError("bad_path", "절대 경로는 쓸 수 없습니다.");
    }
    parts = s.split("/");
  }
  if (parts.length === 0 || parts.length > MAX_DEPTH) {
    throw new StoreError("bad_path", "경로 깊이가 올바르지 않습니다.");
  }
  const last = parts.length - 1;
  if (parts[last].toLowerCase().endsWith(".mdx")) {
    parts[last] = parts[last].slice(0, -4);
  }
  return parts.map(assertSegment);
}

/**
 * 공간 안의 상대 파일 경로(`docs/a/b.mdx` 처럼 확장자 포함)를 검증한다.
 * `allowedExt` 가 주어지면 그 확장자만 허용.
 */
export function parseRelFile(rel: string, allowedExt?: string[]): string[] {
  if (typeof rel !== "string" || !rel) {
    throw new StoreError("bad_path", "파일 경로가 없습니다.");
  }
  if (rel.includes("\\")) throw new StoreError("bad_path", "백슬래시는 쓸 수 없습니다.");
  if (rel.startsWith("/") || /^[a-zA-Z]:/.test(rel)) {
    throw new StoreError("bad_path", "절대 경로는 쓸 수 없습니다.");
  }
  const parts = rel.split("/");
  if (parts.length > MAX_DEPTH + 2) {
    throw new StoreError("bad_path", "경로 깊이가 올바르지 않습니다.");
  }
  parts.forEach(assertSegment);
  if (allowedExt) {
    const ext = path.extname(parts[parts.length - 1]).toLowerCase();
    if (!allowedExt.includes(ext)) {
      throw new StoreError("bad_path", `허용되지 않는 확장자입니다: ${ext || "(없음)"}`);
    }
  }
  return parts;
}

/**
 * root 안의 경로로 합친다. 결과가 root 밖이면 거부.
 * 이미 있는 상위 폴더는 realpath 로도 확인해 심볼릭 링크로 빠져나가는 것을 막는다.
 */
export function joinInside(root: string, parts: string[]): string {
  const absRoot = path.resolve(/*turbopackIgnore: true*/ root);
  const full = path.resolve(/*turbopackIgnore: true*/ absRoot, ...parts);
  if (!isInside(absRoot, full)) {
    throw new StoreError("bad_path", "공간 밖의 경로입니다.");
  }
  // 심볼릭 링크 확인: 존재하는 가장 가까운 상위 폴더의 실제 경로
  let probe = path.dirname(full);
  while (!fs.existsSync(probe) && probe !== absRoot && isInside(absRoot, probe)) {
    probe = path.dirname(probe);
  }
  if (fs.existsSync(probe) && fs.existsSync(absRoot)) {
    const realRoot = fs.realpathSync(absRoot);
    const realProbe = fs.realpathSync(probe);
    if (realProbe !== realRoot && !isInside(realRoot, realProbe)) {
      throw new StoreError("bad_path", "공간 밖을 가리키는 링크입니다.");
    }
  }
  return full;
}

export function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** 디스크 경로 → git 이 쓰는 슬래시 경로 (Windows 백슬래시 정리) */
export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/** 제목 → 파일 이름. 한글·영문·숫자는 남기고 나머지는 대시로. (기존 /edit 규칙과 같다) */
export function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  if (!s) return "doc";
  return WIN_RESERVED.test(s) ? `${s}-doc` : s;
}
