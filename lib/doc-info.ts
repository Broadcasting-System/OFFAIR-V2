import "server-only";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { getAllDocMeta, type DocMeta } from "@/lib/content";

/**
 * 문서 화면에 보여 줄 부가 정보(수정일 · 작성자 · 읽는 시간).
 *
 * 지금은 파일 기반이라 수정일 = .mdx 파일의 mtime, 작성자 = frontmatter 의
 * `author`(없으면 생략). 위키 저장소가 붙으면 이 파일만 저장소 값으로 바꾸면 된다.
 */

const DOCS_DIR = path.join(process.cwd(), "content", "docs");

export interface DocFileInfo {
  updatedAt: Date | null;
  author: string | null;
}

export function getDocFileInfo(slug: string[]): DocFileInfo {
  const file = path.join(DOCS_DIR, ...slug) + ".mdx";
  try {
    const stat = fs.statSync(file);
    const { data } = matter(fs.readFileSync(file, "utf8"));
    const author =
      typeof data.author === "string" && data.author.trim()
        ? data.author.trim()
        : null;
    return { updatedAt: stat.mtime, author };
  } catch {
    return { updatedAt: null, author: null };
  }
}

/** 한국어 기준 분당 약 500자. 코드·태그·마크다운 기호는 빼고 센다. */
export function readingMinutes(body: string): number {
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|~-]/g, " ")
    .replace(/\s+/g, "");
  return Math.max(1, Math.round(text.length / 500));
}

const dayFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});
const fullFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
});
const yearFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
});

/** "11월 5일" (올해가 아니면 "2025년 11월 5일"). 서버에서 서울 시간으로 고정. */
export function formatDate(date: Date): string {
  return yearFmt.format(date) === yearFmt.format(new Date())
    ? dayFmt.format(date)
    : fullFmt.format(date);
}

export interface RecentDoc extends DocMeta {
  updatedAt: Date | null;
}

/** 파일 수정 시각이 최근인 순서. */
export function getRecentDocs(limit?: number): RecentDoc[] {
  const list = getAllDocMeta()
    .map((d) => ({ ...d, updatedAt: getDocFileInfo(d.slug).updatedAt }))
    .sort(
      (a, b) =>
        (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0) ||
        a.title.localeCompare(b.title, "ko")
    );
  return limit ? list.slice(0, limit) : list;
}
