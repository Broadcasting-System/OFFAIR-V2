import "server-only";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import GithubSlugger from "github-slugger";

/**
 * File-based MDX content layer.
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
 */

const CONTENT_ROOT = path.join(process.cwd(), "content", "docs");

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

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface NavGroup {
  category: string;
  order: number;
  items: DocMeta[];
}

const DEFAULT_CATEGORY_ORDER = [
  "시작하기",
  "장비",
  "송출",
  "음향",
  "조명·영상",
  "운영",
];

const SIDEBAR_CONFIG = path.join(process.cwd(), "content", "sidebar.json");

/**
 * Ordered list of sidebar categories, managed from the edit UI via
 * `content/sidebar.json`. Falls back to a sensible default.
 */
export function getCategoryOrder(): string[] {
  try {
    if (fs.existsSync(SIDEBAR_CONFIG)) {
      const json = JSON.parse(fs.readFileSync(SIDEBAR_CONFIG, "utf8"));
      if (Array.isArray(json?.categories) && json.categories.length > 0) {
        return json.categories.map(String);
      }
    }
  } catch {
    /* malformed config — fall back */
  }
  return DEFAULT_CATEGORY_ORDER;
}

function categoryRank(category: string, order: string[]): number {
  const i = order.indexOf(category);
  return i === -1 ? order.length : i;
}

/** Recursively collect every .mdx file path under content/docs. */
function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (entry.isFile() && entry.name.endsWith(".mdx")) return [full];
    return [];
  });
}

function fileToSlug(file: string): string[] {
  const rel = path.relative(CONTENT_ROOT, file).replace(/\.mdx$/, "");
  return rel.split(path.sep);
}

function readDocFile(file: string): Doc {
  const slug = fileToSlug(file);
  const raw = fs.readFileSync(file, "utf8");
  const { content, data } = matter(raw);
  const meta: DocMeta = {
    slug,
    url: "/docs/" + slug.join("/"),
    title: String(data.title ?? slug[slug.length - 1]),
    description: String(data.description ?? ""),
    category: String(data.category ?? "문서"),
    order: Number(data.order ?? 999),
  };
  return { ...meta, body: content, toc: extractToc(content) };
}

/** Pull h2/h3 headings, matching the ids that rehype-slug will emit. */
export function extractToc(body: string): TocItem[] {
  const slugger = new GithubSlugger();
  const lines = body.split("\n");
  const items: TocItem[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.*)$/.exec(line);
    if (!m) continue;
    const text = m[2].replace(/[*_`]/g, "").trim();
    items.push({
      id: slugger.slug(text),
      text,
      level: m[1].length as 2 | 3,
    });
  }
  return items;
}

let _cache: Doc[] | null = null;
function allDocs(): Doc[] {
  // In development we re-read from disk on every request so the in-browser
  // edit mode reflects saved changes immediately. In production we cache.
  if (process.env.NODE_ENV !== "production") {
    return walk(CONTENT_ROOT).map(readDocFile);
  }
  if (!_cache) _cache = walk(CONTENT_ROOT).map(readDocFile);
  return _cache;
}

export function getAllDocMeta(): DocMeta[] {
  return allDocs()
    .map(({ body: _body, toc: _toc, ...meta }) => meta)
    .sort((a, b) => a.order - b.order);
}

export function getDoc(slug: string[]): Doc | null {
  const target = slug.join("/");
  return allDocs().find((d) => d.slug.join("/") === target) ?? null;
}

export function getAllSlugs(): string[][] {
  return allDocs().map((d) => d.slug);
}

/** Sidebar tree: grouped by category, ordered by sidebar.json then `order`. */
export function getNav(): NavGroup[] {
  const categoryOrder = getCategoryOrder();
  const groups = new Map<string, DocMeta[]>();
  for (const meta of getAllDocMeta()) {
    const list = groups.get(meta.category) ?? [];
    list.push(meta);
    groups.set(meta.category, list);
  }
  return [...groups.entries()]
    .map(([category, items]) => ({
      category,
      order: categoryRank(category, categoryOrder),
      items: items.sort((a, b) => a.order - b.order),
    }))
    .sort((a, b) => a.order - b.order || a.category.localeCompare(b.category));
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
  const i = flat.findIndex((d) => d.slug.join("/") === slug.join("/"));
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

/** Lightweight client-side search index: title, description, headings. */
export function getSearchIndex(): SearchDoc[] {
  const order = getFlatDocs().map((d) => d.url);
  return allDocs()
    .map((d) => ({
      title: d.title,
      description: d.description,
      category: d.category,
      url: d.url,
      headings: d.toc.map((t) => t.text),
    }))
    .sort((a, b) => order.indexOf(a.url) - order.indexOf(b.url));
}
