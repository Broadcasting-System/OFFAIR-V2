import "server-only";
import { getStore } from "@/lib/store";
import type { DocFull } from "@/lib/store/space";
import { extractToc as extractTocImpl, type TocItem as StoreTocItem } from "@/lib/store/markdown";

/**
 * File-based MDX content layer — 공개(guide) 공간 저장소(lib/store)를 읽는다.
 *
 * Drop a `.mdx` file anywhere under `content/docs/` and it becomes a page.
 * Frontmatter controls how it appears in the sidebar:
 *
 *   ---
 *   title: OBS 송출 세팅
 *   description: 한 줄 설명
 *   category: 송출            # sidebar group heading
 *   order: 1                  # order within the group
 *   ---
 *
 * Nested folders work too: content/docs/audio/mixer.mdx → /docs/audio/mixer
 *
 * 저장소는 파일 mtime·크기로 캐시하므로 위키 API 로 저장하거나 파일을 직접 고쳐도
 * 다음 렌더에서 바로 반영된다 (페이지 캐시는 저장 API 가 revalidatePath 로 비운다).
 */

export interface DocMeta {
  slug: string[];
  url: string;
  title: string;
  description: string;
  category: string;
  order: number;
}

export interface Doc extends DocMeta {
  body: string;
  toc: TocItem[];
}

export type TocItem = StoreTocItem;

export interface NavGroup {
  category: string;
  order: number;
  items: DocMeta[];
}

function guide() {
  return getStore().guide;
}

/**
 * 페이지 params 의 catch-all 조각은 %xx 로 인코딩된 채 올 수 있다 (한글 경로).
 * 한 번 풀어서 파일 경로와 맞춘다.
 */
function decodeSlug(slug: string[]): string[] {
  return slug.map((s) => {
    if (!/%[0-9A-Fa-f]{2}/.test(s)) return s;
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
}

function meta(d: Pick<DocFull, keyof DocMeta>): DocMeta {
  return {
    slug: d.slug,
    url: d.url,
    title: d.title,
    description: d.description,
    category: d.category,
    order: d.order,
  };
}

/**
 * Ordered list of sidebar categories, managed via `content/sidebar.json`.
 * Falls back to a sensible default.
 */
export function getCategoryOrder(): string[] {
  return guide().categoryOrder();
}

/** Pull h2/h3 headings, matching the ids that rehype-slug will emit. */
export function extractToc(body: string): TocItem[] {
  return extractTocImpl(body);
}

export function getAllDocMeta(): DocMeta[] {
  return guide()
    .listDocs()
    .map(meta)
    .sort((a, b) => a.order - b.order);
}

export function getDoc(slug: string[]): Doc | null {
  let d: DocFull | null = null;
  try {
    d = guide().getDoc(decodeSlug(slug));
  } catch {
    return null; // 잘못된 경로 → 404
  }
  if (!d) return null;
  return { ...meta(d), body: d.body, toc: d.toc };
}

export function getAllSlugs(): string[][] {
  return guide()
    .listDocs()
    .map((d) => d.slug);
}

/** Sidebar tree: grouped by category, ordered by sidebar.json then `order`. */
export function getNav(): NavGroup[] {
  return guide()
    .tree()
    .groups.filter((g) => g.items.length > 0)
    .map((g) => ({ category: g.category, order: g.order, items: g.items.map(meta) }));
}

/** Flattened, ordered list for prev/next navigation. */
export function getFlatDocs(): DocMeta[] {
  return getNav().flatMap((g) => g.items);
}

export function getAdjacent(slug: string[]): {
  prev: DocMeta | null;
  next: DocMeta | null;
} {
  const flat = getFlatDocs();
  const key = decodeSlug(slug).join("/");
  const i = flat.findIndex((d) => d.slug.join("/") === key);
  return {
    prev: i > 0 ? flat[i - 1] : null,
    next: i >= 0 && i < flat.length - 1 ? flat[i + 1] : null,
  };
}

export interface SearchDoc {
  title: string;
  description: string;
  category: string;
  url: string;
  headings: string[];
}

/**
 * Lightweight client-side search index: title, description, headings.
 * (본문까지 검색하는 색인은 GET /api/wiki/<space>/search)
 */
export function getSearchIndex(): SearchDoc[] {
  return guide()
    .searchIndex()
    .map((d) => ({
      title: d.title,
      description: d.description,
      category: d.category,
      url: d.url,
      headings: d.headings,
    }));
}
