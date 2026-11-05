import fs from "node:fs";
import { getSpace, getStore, isSpaceId } from "@/lib/store";
import { StoreError } from "@/lib/store/errors";
import type { Actor, Space, SpaceId } from "@/lib/store/space";
import { listUploads, readUpload, saveUpload } from "@/lib/store/uploads";
import {
  canEdit,
  canModerate,
  canReadComments,
  canReadSpace,
  getViewer,
  permissions,
  type Viewer,
} from "./auth";
import { HttpError, badRequest, forbidden, handle, json, notFound, readJson, unauthorized } from "./http";
import { mdxToLlmText } from "./llm-text";
import { revalidateSpace } from "./revalidate";

/**
 * 위키 API 본체. app/api/** 의 route.ts 는 이 함수들을 부르기만 한다
 * (테스트가 Next 없이 Request → Response 로 바로 부를 수 있게).
 */

export interface SpaceParams {
  space: string;
}
export interface SlugParams extends SpaceParams {
  slug: string[];
}
export interface FileParams extends SpaceParams {
  path: string[];
}

type Need = "read" | "edit" | "comments" | "moderate";

function spaceIdOf(p: SpaceParams): SpaceId {
  if (!isSpaceId(p.space)) throw notFound("없는 공간입니다.");
  return p.space;
}

/** 권한이 없으면 401(로그인 안 함)·403(로그인했지만 부족) */
function authorize(v: Viewer, need: Need, space: SpaceId): void {
  const ok =
    need === "read"
      ? canReadSpace(v, space)
      : need === "edit"
        ? canReadSpace(v, space) && canEdit(v)
        : need === "comments"
          ? canReadSpace(v, space) && canReadComments(v)
          : canModerate(v);
  if (ok) return;
  if (!v.authenticated) throw unauthorized();
  throw forbidden(
    need === "read" ? "부원만 볼 수 있습니다." : need === "comments" ? "댓글은 부원만 볼 수 있습니다." : "부원만 고칠 수 있습니다."
  );
}

async function gate(req: Request, p: SpaceParams, need: Need): Promise<{ viewer: Viewer; id: SpaceId; space: Space }> {
  const id = spaceIdOf(p);
  const viewer = await getViewer(req);
  authorize(viewer, need, id);
  return { viewer, id, space: getSpace(id) };
}

function actorOf(v: Viewer): Actor {
  return { name: v.name, memberId: v.memberId };
}

/** 라우트 catch-all 조각. 아직 %xx 로 남아 있으면 한 번 푼다 */
function slugOf(p: { slug?: string[] }): string[] {
  const parts = Array.isArray(p.slug) ? p.slug : [];
  if (parts.length === 0) throw badRequest("문서 경로가 없습니다.");
  return parts.map((s) => {
    if (!/%[0-9A-Fa-f]{2}/.test(s)) return s;
    try {
      return decodeURIComponent(s);
    } catch {
      throw new StoreError("bad_path", "경로를 읽을 수 없습니다.");
    }
  });
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** 바깥에서 쓸 절대 주소 (OFFAIR_PUBLIC_URL, 예: https://offair.bssmcast.com). 없으면 상대 경로 */
export function publicUrl(path: string): string {
  const base = (process.env.OFFAIR_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  return base ? base + path : path;
}

/** 문서가 마지막으로 바뀐 때·사람 (git, 없으면 파일 시각) */
async function updatedOf(space: Space, doc: { path: string }): Promise<{ updatedAt: string | null; updatedBy: string | null }> {
  const last = await space.git.lastCommit(doc.path).catch(() => null);
  if (last) return { updatedAt: last.date, updatedBy: last.author };
  try {
    const st = fs.statSync(space.absOf(doc.path));
    return { updatedAt: st.mtime.toISOString(), updatedBy: null };
  } catch {
    return { updatedAt: null, updatedBy: null };
  }
}

function afterWrite(id: SpaceId) {
  revalidateSpace(id);
}

/* ───────────────────────── 나 ───────────────────────── */

export function me(req: Request): Promise<Response> {
  return handle(req, async () => {
    const v = await getViewer(req);
    const store = getStore();
    return json({
      role: v.role,
      name: v.name,
      memberId: v.memberId,
      authenticated: v.authenticated,
      cohort: v.cohort ?? null,
      roleLabel: v.roleLabel ?? null,
      ...permissions(v),
      readOnly: store.config.readOnly,
    });
  });
}

/**
 * GET /api/me/activity — 내 메뉴: 나를 부른 댓글·내가 고친 문서 (읽을 수 있는 공간만).
 * 내 초안은 브라우저(localStorage)에만 있어서 여기 없다.
 */
export function activity(req: Request): Promise<Response> {
  return handle(req, async () => {
    const v = await getViewer(req);
    if (!v.authenticated) throw unauthorized();
    const store = getStore();
    const ids: SpaceId[] = canReadSpace(v, "members") && store.members ? ["guide", "members"] : ["guide"];
    const mentions = [];
    const edits = [];
    for (const id of ids) {
      const space = getSpace(id);
      if (v.memberId && canReadComments(v)) {
        for (const m of store.comments.mentionsOf(id, v.memberId, 20)) {
          const doc = space.getDoc(m.slug);
          if (doc) mentions.push({ ...m, url: doc.url, title: doc.title });
        }
      }
      for (const e of await space.editsBy(actorOf(v), 15)) edits.push({ space: id, ...e });
    }
    mentions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    edits.sort((a, b) => b.date.localeCompare(a.date));
    return json({ mentions: mentions.slice(0, 20), edits: edits.slice(0, 20) });
  });
}

/* ───────────────────────── 트리·검색 ───────────────────────── */

export function tree(req: Request, p: SpaceParams): Promise<Response> {
  return handle(req, async () => {
    const { space } = await gate(req, p, "read");
    return json(space.tree());
  });
}

export function search(req: Request, p: SpaceParams): Promise<Response> {
  return handle(req, async () => {
    const { space, id } = await gate(req, p, "read");
    const index = space.searchIndex();
    const sp = new URL(req.url).searchParams;
    const q = sp.get("q")?.trim().toLowerCase() ?? "";
    if (!q) return json({ space: id, docs: index });
    const limitIn = Number(sp.get("limit"));
    const limit = Number.isFinite(limitIn) && limitIn > 0 ? Math.min(20, Math.floor(limitIn)) : 8;
    const tokens = q.split(/\s+/).filter(Boolean).slice(0, 8);
    const results = [];
    for (const d of index) {
      const title = d.title.toLowerCase();
      const desc = d.description.toLowerCase();
      const cat = d.category.toLowerCase();
      const heads = d.headings.map((h) => h.toLowerCase());
      const text = d.text.toLowerCase();
      const hay = [title, desc, cat, ...heads, text].join("  ");
      if (!tokens.every((t) => hay.includes(t))) continue;
      let score = 0;
      if (title.includes(q)) score += 100;
      if (title.startsWith(q)) score += 50;
      if (cat.includes(q)) score += 20;
      if (desc.includes(q)) score += 15;
      const heading = d.headings.find((h) => h.toLowerCase().includes(q));
      if (heading) score += 10;
      for (const t of tokens) if (text.includes(t)) score += 5;
      const at = text.indexOf(tokens[0]);
      const from = Math.max(0, at - 60);
      const to = at + 100;
      // 앞뒤가 잘렸으면 … 를 붙인다
      const snippet =
        at === -1
          ? d.description
          : (from > 0 ? "…" : "") + d.text.slice(from, to).replace(/\s+/g, " ").trim() + (to < d.text.length ? "…" : "");
      results.push({ ...d, text: undefined, path: d.url, url: publicUrl(d.url), score, heading: heading ?? null, snippet });
    }
    results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    const top = results.slice(0, limit);
    const withDates = await Promise.all(
      top.map(async (r) => ({ ...r, updatedAt: (await updatedOf(space, { path: space.relOf(r.slug) })).updatedAt }))
    );
    return json({ space: id, q, limit, total: results.length, results: withDates });
  });
}

/* ───────────────────────── 문서 ───────────────────────── */

export function getDoc(req: Request, p: SlugParams): Promise<Response> {
  return handle(req, async () => {
    const { space, viewer, id } = await gate(req, p, "read");
    const doc = space.requireDoc(slugOf(p));
    const sp = new URL(req.url).searchParams;
    if (sp.get("format") === "text") {
      // CUE 같은 LLM 용: 머리말은 따로, 본문은 평범한 마크다운 (lib/wiki/llm-text.ts)
      const section = sp.get("section");
      const t = mdxToLlmText(doc.body, { section });
      if (!t.found) throw notFound("그 소제목을 찾을 수 없습니다.", { headings: t.headings.map((h) => h.text) });
      return json({
        space: id,
        slug: doc.slug,
        title: doc.title,
        description: doc.description,
        category: doc.category,
        url: publicUrl(doc.url),
        path: doc.url,
        ...(await updatedOf(space, doc)),
        ...(section ? { section } : {}),
        headings: t.headings.map((h) => h.text),
        text: t.text,
      });
    }
    const lastCommit = await space.git.lastCommit(doc.path).catch(() => null);
    const comments = canReadComments(viewer) ? getStore().comments.count(id, doc.slug) : undefined;
    return json({ ...doc, lastCommit, ...(comments !== undefined ? { commentCount: comments } : {}) });
  });
}

export function saveDoc(req: Request, p: SlugParams): Promise<Response> {
  return handle(req, async () => {
    const { space, viewer, id } = await gate(req, p, "edit");
    const b = await readJson(req);
    const baseRev = str(b.baseRev);
    if (!baseRev) throw badRequest("baseRev 가 필요합니다 (편집을 시작한 문서의 rev).");
    const result = await space.save(
      slugOf(p),
      {
        baseRev,
        raw: str(b.raw),
        frontmatter: b.frontmatter && typeof b.frontmatter === "object" ? (b.frontmatter as Record<string, unknown>) : undefined,
        body: str(b.body),
        message: str(b.message),
      },
      actorOf(viewer)
    );
    if (result.commit) afterWrite(id);
    return json(result);
  });
}

export function createDoc(req: Request, p: SpaceParams): Promise<Response> {
  return handle(req, async () => {
    const { space, viewer, id } = await gate(req, p, "edit");
    const b = await readJson(req);
    const result = await space.create(
      {
        title: String(b.title ?? ""),
        category: str(b.category),
        slug: Array.isArray(b.slug) ? (b.slug as string[]) : str(b.slug),
        description: str(b.description),
        body: str(b.body),
        frontmatter: b.frontmatter && typeof b.frontmatter === "object" ? (b.frontmatter as Record<string, unknown>) : undefined,
        message: str(b.message),
      },
      actorOf(viewer)
    );
    afterWrite(id);
    return json(result, { status: 201 });
  });
}

export function deleteDoc(req: Request, p: SlugParams): Promise<Response> {
  return handle(req, async () => {
    const { space, viewer, id } = await gate(req, p, "edit");
    const url = new URL(req.url);
    const result = await space.remove(
      slugOf(p),
      { baseRev: url.searchParams.get("baseRev") ?? undefined, message: url.searchParams.get("message") ?? undefined },
      actorOf(viewer)
    );
    afterWrite(id);
    return json(result);
  });
}

export function moveDoc(req: Request, p: SpaceParams): Promise<Response> {
  return handle(req, async () => {
    const { space, viewer, id } = await gate(req, p, "edit");
    const b = await readJson(req);
    const from = Array.isArray(b.from) ? (b.from as string[]) : str(b.from);
    if (!from) throw badRequest("from(옮길 문서 경로)이 필요합니다.");
    const result = await space.move(
      from,
      {
        to: Array.isArray(b.to) ? (b.to as string[]) : str(b.to),
        category: str(b.category),
        index: typeof b.index === "number" ? b.index : undefined,
        baseRev: str(b.baseRev),
      },
      actorOf(viewer)
    );
    if (result.doc && result.from.join("/") !== result.doc.slug.join("/")) {
      await getStore().comments.move(id, result.from, result.doc.slug).catch((e) => {
        console.warn("[offair] 댓글 옮기기 실패:", (e as Error).message);
      });
    }
    if (result.commits.length) afterWrite(id);
    return json({ ...result, tree: space.tree() });
  });
}

/* ───────────────────────── 사이드바 ───────────────────────── */

export function getSidebar(req: Request, p: SpaceParams): Promise<Response> {
  return handle(req, async () => {
    const { space } = await gate(req, p, "read");
    const t = space.tree();
    return json({
      space: t.space,
      categories: t.categories,
      configured: space.readSidebar().categories,
      groups: t.groups.map((g) => ({ category: g.category, items: g.items.map((i) => i.slug.join("/")) })),
    });
  });
}

/** 전체 배치 저장: { groups: [{ category, items: ["slug", …] }] } */
export function putSidebar(req: Request, p: SpaceParams): Promise<Response> {
  return handle(req, async () => {
    const { space, viewer, id } = await gate(req, p, "edit");
    const b = await readJson(req);
    if (!Array.isArray(b.groups)) throw badRequest("groups 배열이 필요합니다.");
    const result = await space.setLayout(b.groups as { category: string; items: string[] }[], actorOf(viewer));
    if (result.commit) afterWrite(id);
    return json(result);
  });
}

/** 카테고리 작업: { action: "add"|"rename"|"remove"|"reorder", … } */
export function patchSidebar(req: Request, p: SpaceParams): Promise<Response> {
  return handle(req, async () => {
    const { space, viewer, id } = await gate(req, p, "edit");
    const b = await readJson(req);
    const result = await space.editCategories(b as never, actorOf(viewer));
    if (result.commit) afterWrite(id);
    return json(result);
  });
}

/* ───────────────────────── 이력 ───────────────────────── */

export function history(req: Request, p: SlugParams): Promise<Response> {
  return handle(req, async () => {
    const { space } = await gate(req, p, "read");
    const limit = Number(new URL(req.url).searchParams.get("limit")) || 100;
    const slug = slugOf(p);
    return json({ slug, entries: await space.history(slug, limit) });
  });
}

export function revision(req: Request, p: SlugParams): Promise<Response> {
  return handle(req, async () => {
    const { space } = await gate(req, p, "read");
    const rev = new URL(req.url).searchParams.get("rev");
    if (!rev) throw badRequest("rev 가 필요합니다.");
    return json(await space.revision(slugOf(p), rev));
  });
}

export function diff(req: Request, p: SlugParams): Promise<Response> {
  return handle(req, async () => {
    const { space } = await gate(req, p, "read");
    const sp = new URL(req.url).searchParams;
    const from = sp.get("from");
    if (!from) throw badRequest("from 이 필요합니다 (리비전 또는 empty).");
    return json(await space.diff(slugOf(p), from, sp.get("to") ?? undefined));
  });
}

export function revert(req: Request, p: SlugParams): Promise<Response> {
  return handle(req, async () => {
    const { space, viewer, id } = await gate(req, p, "edit");
    const b = await readJson(req);
    const rev = str(b.rev);
    if (!rev) throw badRequest("rev 가 필요합니다.");
    const result = await space.revert(slugOf(p), rev, { baseRev: str(b.baseRev), message: str(b.message) }, actorOf(viewer));
    if (result.commit) afterWrite(id);
    return json(result);
  });
}

export function trash(req: Request, p: SpaceParams): Promise<Response> {
  return handle(req, async () => {
    const { space, id } = await gate(req, p, "read");
    return json({ space: id, docs: await space.trash() });
  });
}

/* ───────────────────────── 업로드 ───────────────────────── */

export function upload(req: Request, p: SpaceParams): Promise<Response> {
  return handle(req, async () => {
    const { space, viewer, id } = await gate(req, p, "edit");
    const limit = Math.max(space.layout.upload.maxFileBytes, space.layout.upload.maxImageBytes);
    const len = Number(req.headers.get("content-length") || 0);
    if (len > limit + 1024 * 1024) {
      throw new HttpError(413, "too_large", `파일이 너무 큽니다 (최대 ${Math.round(limit / 1024 / 1024)}MB).`);
    }
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw badRequest("multipart/form-data 본문이 필요합니다 (file 필드).");
    }
    const file = form.get("file");
    if (!file || typeof file === "string") throw badRequest("file 필드가 없습니다.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const field = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    const num = (k: string) => {
      const n = Number(field(k));
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const result = await saveUpload(
      space,
      getStore().config.dataDir,
      { name: file.name, bytes, doc: field("doc"), of: field("of"), width: num("width"), height: num("height") },
      actorOf(viewer)
    );
    afterWrite(id);
    return json(result, { status: 201 });
  });
}

/** GET /api/wiki/<space>/uploads[?doc=&q=] — 올린 파일 목록 (넣기 창의 "올린 파일에서") */
export function uploads(req: Request, p: SpaceParams): Promise<Response> {
  return handle(req, async () => {
    const { space, id } = await gate(req, p, "edit");
    const sp = new URL(req.url).searchParams;
    return json({ space: id, files: listUploads(space, getStore().config.dataDir, { doc: sp.get("doc"), q: sp.get("q") }) });
  });
}

const INLINE = /^(image|audio|video)\/|^application\/pdf$/;

function fileResponse(f: { bytes: Buffer; type: string; name: string }, cacheControl: string): Response {
  const headers = new Headers({
    "content-type": f.type,
    "content-length": String(f.bytes.length),
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
  });
  if (INLINE.test(f.type)) {
    headers.set("content-disposition", "inline");
  } else {
    headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    headers.set("content-security-policy", "default-src 'none'; sandbox");
  }
  return new Response(new Uint8Array(f.bytes), { headers });
}

/** /api/wiki/<space>/files/<yyyy-mm>/<name> — 부원 파일은 권한 확인 뒤에만 */
export function file(req: Request, p: FileParams): Promise<Response> {
  return handle(req, async () => {
    const { space, id } = await gate(req, p, "read");
    const f = readUpload(space, Array.isArray(p.path) ? p.path : []);
    if (!f) throw notFound("파일이 없습니다.");
    return fileResponse(f, id === "guide" ? "public, max-age=3600" : "private, max-age=300");
  });
}

/**
 * /uploads/<…> — 서버가 켜진 뒤 올라온 공개 파일.
 * (next start 는 시작할 때 있던 public/ 파일만 정적으로 내준다. 그 뒤에 올린 것은 여기로 온다)
 */
export function publicUpload(req: Request, p: { path: string[] }): Promise<Response> {
  return handle(req, async () => {
    const f = readUpload(getSpace("guide"), Array.isArray(p.path) ? p.path : []);
    if (!f) throw notFound("파일이 없습니다.");
    return fileResponse(f, "public, max-age=3600");
  });
}

/* ───────────────────────── 댓글 ───────────────────────── */

export function listComments(req: Request, p: SlugParams): Promise<Response> {
  return handle(req, async () => {
    const { id, viewer } = await gate(req, p, "comments");
    const slug = slugOf(p);
    const store = getStore().comments;
    // @부르기 후보에 나 자신도 넣는다
    const people = store.people(id);
    if (viewer.memberId && !people.some((p) => p.memberId === viewer.memberId)) people.push({ memberId: viewer.memberId, name: viewer.name });
    return json({ slug, comments: store.list(id, slug), people, me: { memberId: viewer.memberId, name: viewer.name, ...permissions(viewer) } });
  });
}

export function addComment(req: Request, p: SlugParams): Promise<Response> {
  return handle(req, async () => {
    const { id, viewer, space } = await gate(req, p, "edit");
    const slug = slugOf(p);
    space.requireDoc(slug);
    const b = await readJson(req);
    const c = await getStore().comments.add(
      id,
      slug,
      { body: b.body, parentId: str(b.parentId) ?? null, anchor: b.anchor, mentions: b.mentions },
      actorOf(viewer)
    );
    return json(c, { status: 201 });
  });
}

export function editComment(req: Request, p: SlugParams): Promise<Response> {
  return handle(req, async () => {
    const { id, viewer } = await gate(req, p, "edit");
    const b = await readJson(req);
    const cid = str(b.id);
    if (!cid) throw badRequest("id 가 필요합니다.");
    const store = getStore().comments;
    // { id, resolved } 해결/다시 열기 · { id, like } 좋아요 · { id, body, mentions? } 고치기(내 것만)
    if (typeof b.resolved === "boolean") return json(await store.setResolved(id, slugOf(p), cid, b.resolved, actorOf(viewer)));
    if (typeof b.like === "boolean") return json(await store.setLike(id, slugOf(p), cid, b.like, actorOf(viewer)));
    return json(await store.edit(id, slugOf(p), cid, b.body, actorOf(viewer), b.mentions));
  });
}

export function deleteComment(req: Request, p: SlugParams): Promise<Response> {
  return handle(req, async () => {
    const { id, viewer } = await gate(req, p, "edit");
    const cid = new URL(req.url).searchParams.get("id");
    if (!cid) throw badRequest("id 가 필요합니다.");
    return json(await getStore().comments.remove(id, slugOf(p), cid, actorOf(viewer), { moderator: canModerate(viewer) }));
  });
}

/* ───────────────────────── 공개 저장소 동기화 ───────────────────────── */

export function syncStatus(req: Request, p: SpaceParams): Promise<Response> {
  return handle(req, async () => {
    const { id } = await gate(req, p, "edit");
    if (id !== "guide") throw notFound("부원 공간은 어디에도 올리지 않습니다.");
    return json(getStore().pusher.status());
  });
}

export function syncNow(req: Request, p: SpaceParams): Promise<Response> {
  return handle(req, async () => {
    const { id } = await gate(req, p, "moderate");
    if (id !== "guide") throw notFound("부원 공간은 어디에도 올리지 않습니다.");
    return json(await getStore().pusher.pushNow());
  });
}
