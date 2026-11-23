/**
 * 편집기가 문서를 읽고·게시하고·파일을 올릴 때 쓰는 얇은 창구 — 위키 API(lib/wiki/handlers.ts)를 부른다.
 *
 *   getDoc(space, path)            → { mdx, rev, meta }                GET  /api/wiki/<space>/docs/<path>
 *   saveDoc(space, path, mdx, rev) → { ok: true, rev }                  PUT  /api/wiki/<space>/docs/<path>  { baseRev, raw }
 *                                    | { ok: false, conflict: true, rev, mdx }   (409 — 그 사이 누가 게시함)
 *   uploadFile(space, file, doc?)  → { url }                            POST /api/wiki/<space>/uploads (multipart)
 *
 * - space: "guide"(가이드북) 또는 "members"(개발 문서). 둘 다 부원 전용
 * - path:  공간 안 문서 경로(slug), 확장자 없이. 예) "onair-time", "meeting/2026-11"
 * - rev:   문서를 열 때 받은 판 번호(파일 내용의 git 블롭 해시). 게시할 때 baseRev 로 돌려보낸다.
 *          rev 가 null 이면 새 문서 — 먼저 만들고(POST /docs) 그다음 원문을 저장한다.
 */
import { parseFrontmatter, splitFrontmatter } from "./frontmatter";

export interface WikiDocMeta {
  title: string;
  description: string;
  category: string;
  order: number | null;
}

export interface WikiDoc {
  mdx: string;
  rev: string | null;
  meta: WikiDocMeta;
}

export type SaveResult =
  | { ok: true; rev: string }
  | { ok: false; conflict: true; rev: string | null; mdx: string }
  | { ok: false; conflict?: false; error: string };

export interface WikiClient {
  getDoc(space: string, path: string): Promise<WikiDoc | null>;
  saveDoc(space: string, path: string, mdx: string, rev: string | null): Promise<SaveResult>;
  uploadFile(space: string, file: File, doc?: string | null): Promise<{ url: string }>;
  /** 새 문서의 경로 정하기 (제목 → slug, 겹치지 않게). 없으면 편집기가 직접 만든다. */
  suggestPath?(space: string, title: string): Promise<string>;
}

const docUrl = (space: string, path: string) =>
  `/api/wiki/${encodeURIComponent(space)}/docs/${path.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`;

async function readJson(r: Response): Promise<Record<string, unknown>> {
  try {
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function messageOf(j: Record<string, unknown>, status: number): string {
  if (status === 401) return "로그인이 풀렸어요. 다시 로그인한 뒤 게시하세요 (초안은 브라우저에 남아 있어요).";
  if (status === 403) return typeof j.message === "string" ? j.message : "고칠 권한이 없어요.";
  return typeof j.message === "string" ? j.message : `요청이 실패했어요 (${status})`;
}

function metaOf(mdx: string): WikiDocMeta {
  const m = parseFrontmatter(splitFrontmatter(mdx).yaml);
  return { title: m.title, description: m.description, category: m.category, order: m.order };
}

async function put(space: string, path: string, mdx: string, baseRev: string, summary?: string): Promise<SaveResult> {
  const r = await fetch(docUrl(space, path), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseRev, raw: mdx, ...(summary ? { message: summary } : {}) }),
    cache: "no-store",
  });
  const j = await readJson(r);
  if (r.status === 409) {
    const current = (j.current ?? {}) as { raw?: string };
    return { ok: false, conflict: true, rev: typeof j.currentRev === "string" ? j.currentRev : null, mdx: current.raw ?? "" };
  }
  if (r.status === 404) return { ok: false, conflict: true, rev: null, mdx: "" };
  if (!r.ok) return { ok: false, error: messageOf(j, r.status) };
  const doc = (j.doc ?? null) as { rev?: string } | null;
  return { ok: true, rev: doc?.rev ?? baseRev };
}


/** 위키 API 어댑터 (기본) */
export const httpAdapter: WikiClient = {
  async getDoc(space, path) {
    const r = await fetch(docUrl(space, path), { cache: "no-store" });
    if (r.status === 404) return null;
    const j = await readJson(r);
    if (!r.ok) throw new Error(messageOf(j, r.status));
    const raw = String(j.raw ?? "");
    return { mdx: raw, rev: typeof j.rev === "string" ? j.rev : null, meta: metaOf(raw) };
  },

  async saveDoc(space, path, mdx, rev) {
    try {
      if (rev) return await put(space, path, mdx, rev);
      // 새 문서: 같은 경로로 만든 뒤 원문 그대로 저장
      const meta = metaOf(mdx);
      const created = await fetch(`/api/wiki/${encodeURIComponent(space)}/docs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: meta.title || "제목 없는 문서", category: meta.category || undefined, slug: path }),
        cache: "no-store",
      });
      const cj = await readJson(created);
      if (created.status === 409) return { ok: false, conflict: true, rev: null, mdx: "" };
      if (!created.ok) return { ok: false, error: messageOf(cj, created.status) };
      const doc = cj.doc as { rev: string; slug: string[] };
      return await put(space, doc.slug.join("/"), mdx, doc.rev);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async uploadFile(space, file, doc) {
    const form = new FormData();
    form.set("file", file, file.name);
    if (doc) form.set("doc", doc);
    const r = await fetch(`/api/wiki/${encodeURIComponent(space)}/uploads`, { method: "POST", body: form, cache: "no-store" });
    const j = await readJson(r);
    if (!r.ok) throw new Error(messageOf(j, r.status));
    return { url: String(j.url) };
  },

  async suggestPath(space, title) {
    // 서버의 slugify 와 같은 규칙. 겹치면 -2, -3 … (트리를 받아 확인)
    const base =
      title
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "doc";
    let taken = new Set<string>();
    try {
      const r = await fetch(`/api/wiki/${encodeURIComponent(space)}/tree`, { cache: "no-store" });
      const t = (await r.json()) as { groups: { items: { slug: string[] }[] }[] };
      taken = new Set(t.groups.flatMap((g) => g.items.map((i) => i.slug.join("/"))));
    } catch {
      /* 못 받으면 서버가 409 로 알려 준다 */
    }
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    return slug;
  },
};

export const wikiClient: WikiClient = httpAdapter;

export { DEFAULT_SPACE } from "./space";
