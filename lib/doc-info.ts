import "server-only";
import fs from "node:fs";
import { getAllDocMeta, spaceOf, type ContentSpace, type DocMeta } from "@/lib/content";

/**
 * 문서 화면에 보여 줄 부가 정보(마지막 수정 · 고친 사람 · 읽는 시간).
 *
 * 마지막 수정은 공간 저장소의 git 이력(그 파일을 마지막으로 바꾼 커밋)에서 읽고,
 * git 이 없으면 파일 시각을 쓴다. 고친 사람은 그 커밋의 작성자, 없으면 frontmatter `author`.
 */

export interface DocFileInfo {
  updatedAt: Date | null;
  author: string | null;
}

export async function getDocInfo(space: ContentSpace, doc: { path: string; slug: string[] }): Promise<DocFileInfo> {
  const sp = spaceOf(space);
  if (!sp) return { updatedAt: null, author: null };
  const last = await sp.git.lastCommit(doc.path).catch(() => null);
  if (last) return { updatedAt: new Date(last.date), author: last.author || null };
  const d = sp.getDoc(doc.slug);
  const fmAuthor = typeof d?.frontmatter.author === "string" && d.frontmatter.author.trim() ? d.frontmatter.author.trim() : null;
  try {
    return { updatedAt: fs.statSync(sp.absOf(doc.path)).mtime, author: fmAuthor };
  } catch {
    return { updatedAt: null, author: fmAuthor };
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

/** 파일 수정 시각이 최근인 순서 (목록은 git 을 문서마다 부르지 않고 파일 시각으로). */
export function getRecentDocs(limit?: number, space: ContentSpace = "guide"): RecentDoc[] {
  const sp = spaceOf(space);
  if (!sp) return [];
  const mtime = (d: DocMeta) => {
    try {
      return fs.statSync(sp.absOf(sp.relOf(d.slug))).mtime;
    } catch {
      return null;
    }
  };
  const list = getAllDocMeta(space)
    .map((d) => ({ ...d, updatedAt: mtime(d) }))
    .sort(
      (a, b) =>
        (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0) ||
        a.title.localeCompare(b.title, "ko")
    );
  return limit ? list.slice(0, limit) : list;
}
