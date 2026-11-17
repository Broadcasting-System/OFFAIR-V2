import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { StoreError } from "./errors";
import { readIfExists, writeFileAtomic, removeFile } from "./fsutil";
import { repoMutex } from "./mutex";
import { joinInside, parseSlug } from "./paths";
import type { Actor, SpaceId } from "./space";
import { cleanAnchor, type Anchor } from "@/lib/wiki/anchor";

/**
 * 문서 댓글 — <data>/comments/<space>/<slug…>.json
 * 공개 저장소에 들어가지 않는다. 답글은 한 단계까지 (답글에 단 답글은 같은 댓글 아래로).
 *
 * 맨 위 댓글은 본문 글에 붙을 수 있다(anchor: 고른 글 + 앞뒤 글, lib/wiki/anchor.ts).
 * anchor 가 없으면 문서 전체에 다는 댓글. 해결(resolved)·좋아요(likes: 누른 사람 memberId)·
 * @부르기(mentions)를 함께 기억한다. 예전 파일에는 이 칸들이 없을 수 있다.
 */

export interface CommentAuthor {
  name: string;
  memberId: string | null;
}

export interface Mention {
  memberId: string;
  name: string;
}

export interface Reply {
  id: string;
  author: CommentAuthor;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  likes?: string[];
  mentions?: Mention[];
}

export interface Comment extends Reply {
  /** 답글이 달린 댓글을 지우면 내용만 지우고 자리는 남긴다 */
  deleted: boolean;
  replies: Reply[];
  /** 본문 글에 단 댓글이면 그 자리. 없으면 문서 전체 댓글 */
  anchor?: Anchor | null;
  resolved?: { by: CommentAuthor; at: string } | null;
}

/** 나를 부른 댓글 한 줄 (내 메뉴용) */
export interface MentionHit {
  space: SpaceId;
  slug: string[];
  id: string;
  /** 맨 위 댓글 id (답글이면 그 부모) */
  threadId: string;
  author: CommentAuthor;
  body: string;
  createdAt: string;
  /** 본문 글에 단 댓글이면 고른 글 앞부분 */
  quote: string | null;
}

interface CommentFile {
  version: 1;
  comments: Comment[];
}

const MAX_BODY = 5000;

export interface CommentPermission {
  /** 남의 댓글도 지울 수 있음 (부장·최고 관리자) */
  moderator: boolean;
}

function cleanBody(body: unknown): string {
  const s = String(body ?? "").replace(/\r\n?/g, "\n").trim();
  if (!s) throw new StoreError("bad_request", "댓글 내용을 입력하세요.");
  if (s.length > MAX_BODY) throw new StoreError("too_large", `댓글은 ${MAX_BODY}자까지 쓸 수 있습니다.`);
  return s;
}

function cleanMentions(input: unknown): Mention[] {
  if (!Array.isArray(input)) return [];
  const out: Mention[] = [];
  const seen = new Set<string>();
  for (const m of input.slice(0, 20)) {
    const id = String((m as Mention)?.memberId ?? "").slice(0, 80);
    const name = String((m as Mention)?.name ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, 80);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ memberId: id, name });
  }
  return out;
}

function authorOf(actor: Actor): CommentAuthor {
  return { name: String(actor.name || "익명").slice(0, 80), memberId: actor.memberId ?? null };
}

function isOwner(c: Reply, actor: Actor): boolean {
  if (c.author.memberId && actor.memberId) return c.author.memberId === actor.memberId;
  return false;
}

export class CommentStore {
  readonly root: string;

  constructor(dataDir: string) {
    this.root = path.join(path.resolve(/*turbopackIgnore: true*/ dataDir), "comments");
  }

  private fileOf(space: SpaceId, slugInput: string | string[]): string {
    const slug = parseSlug(slugInput);
    const last = slug.length - 1;
    const parts = [space, ...slug.slice(0, last), `${slug[last]}.json`];
    return joinInside(this.root, parts);
  }

  private read(file: string): CommentFile {
    const buf = readIfExists(file);
    if (!buf) return { version: 1, comments: [] };
    try {
      const j = JSON.parse(buf.toString("utf8"));
      if (Array.isArray(j?.comments)) return { version: 1, comments: j.comments };
    } catch {
      /* 깨진 파일은 덮어쓰지 않도록 오류 */
      throw new StoreError("unavailable", "댓글 파일을 읽을 수 없습니다.");
    }
    return { version: 1, comments: [] };
  }

  private async write(file: string, data: CommentFile) {
    if (data.comments.length === 0) {
      await removeFile(file);
      return;
    }
    await writeFileAtomic(file, JSON.stringify(data, null, 2) + "\n");
  }

  private mutate<T>(file: string, fn: (data: CommentFile) => T): Promise<T> {
    return repoMutex.run(`comments:${file}`, async () => {
      const data = this.read(file);
      const out = fn(data);
      await this.write(file, data);
      return out;
    });
  }

  list(space: SpaceId, slug: string | string[]): Comment[] {
    return this.read(this.fileOf(space, slug)).comments;
  }

  count(space: SpaceId, slug: string | string[]): number {
    return this.list(space, slug).reduce((n, c) => n + (c.deleted ? 0 : 1) + c.replies.length, 0);
  }

  add(
    space: SpaceId,
    slug: string | string[],
    input: { body: unknown; parentId?: string | null; anchor?: unknown; mentions?: unknown },
    actor: Actor
  ): Promise<Comment | Reply> {
    const body = cleanBody(input.body);
    const file = this.fileOf(space, slug);
    const now = new Date().toISOString();
    const mentions = cleanMentions(input.mentions);
    const base: Reply = {
      id: crypto.randomUUID(),
      author: authorOf(actor),
      body,
      createdAt: now,
      updatedAt: null,
      likes: [],
      ...(mentions.length ? { mentions } : {}),
    };
    return this.mutate(file, (data) => {
      if (input.parentId) {
        // 답글의 답글은 맨 위 댓글 아래로 붙인다
        const parent =
          data.comments.find((c) => c.id === input.parentId) ??
          data.comments.find((c) => c.replies.some((r) => r.id === input.parentId));
        if (!parent) throw new StoreError("not_found", "답글을 달 댓글을 찾을 수 없습니다.");
        parent.replies.push(base);
        return base;
      }
      const anchor = cleanAnchor(input.anchor);
      const c: Comment = { ...base, deleted: false, replies: [], anchor, resolved: null };
      data.comments.push(c);
      return c;
    });
  }

  edit(space: SpaceId, slug: string | string[], id: string, bodyInput: unknown, actor: Actor, mentionsInput?: unknown): Promise<Reply> {
    const body = cleanBody(bodyInput);
    const file = this.fileOf(space, slug);
    return this.mutate(file, (data) => {
      const target = findAny(data, id);
      if (!target || (target.kind === "comment" && target.item.deleted)) {
        throw new StoreError("not_found", "댓글을 찾을 수 없습니다.");
      }
      if (!isOwner(target.item, actor)) throw new StoreError("forbidden", "내 댓글만 고칠 수 있습니다.");
      target.item.body = body;
      target.item.updatedAt = new Date().toISOString();
      if (mentionsInput !== undefined) target.item.mentions = cleanMentions(mentionsInput);
      return target.item;
    });
  }

  /** 맨 위 댓글 해결/다시 열기 — 쓸 수 있는 사람 누구나 */
  setResolved(space: SpaceId, slug: string | string[], id: string, resolved: boolean, actor: Actor): Promise<Comment> {
    const file = this.fileOf(space, slug);
    return this.mutate(file, (data) => {
      const c = data.comments.find((x) => x.id === id);
      if (!c) throw new StoreError("not_found", "댓글을 찾을 수 없습니다.");
      c.resolved = resolved ? { by: authorOf(actor), at: new Date().toISOString() } : null;
      return c;
    });
  }

  /** 좋아요 누르기/빼기 (사람마다 한 번) */
  setLike(space: SpaceId, slug: string | string[], id: string, like: boolean, actor: Actor): Promise<Reply> {
    const file = this.fileOf(space, slug);
    const who = actor.memberId ? String(actor.memberId) : null;
    if (!who) return Promise.reject(new StoreError("forbidden", "로그인한 부원만 누를 수 있습니다."));
    return this.mutate(file, (data) => {
      const target = findAny(data, id);
      if (!target || (target.kind === "comment" && target.item.deleted)) {
        throw new StoreError("not_found", "댓글을 찾을 수 없습니다.");
      }
      const likes = new Set(target.item.likes ?? []);
      if (like) likes.add(who);
      else likes.delete(who);
      target.item.likes = [...likes];
      return target.item;
    });
  }

  /**
   * 나를 부른 댓글 — 이 공간의 모든 댓글·답글 중 mentions 에 memberId 가 있는 것 (최근 것 먼저).
   * 지운 댓글과 내가 쓴 것은 뺀다.
   */
  mentionsOf(space: SpaceId, memberId: string, limit = 30): MentionHit[] {
    const dir = joinInside(this.root, [space]);
    const out: MentionHit[] = [];
    const walk = (d: string, prefix: string[]) => {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full, [...prefix, e.name]);
        else if (e.name.endsWith(".json")) {
          const slug = [...prefix, e.name.slice(0, -5)];
          let comments: Comment[];
          try {
            comments = this.read(full).comments;
          } catch {
            continue;
          }
          for (const c of comments) {
            for (const x of [c, ...c.replies]) {
              if (x === c && c.deleted) continue;
              if (x.author.memberId === memberId) continue;
              if (!(x.mentions ?? []).some((m) => m.memberId === memberId)) continue;
              out.push({
                space,
                slug,
                id: x.id,
                threadId: c.id,
                author: x.author,
                body: x.body.slice(0, 200),
                createdAt: x.createdAt,
                quote: c.anchor?.quote?.slice(0, 80) ?? null,
              });
            }
          }
        }
      }
    };
    walk(dir, []);
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  /** @부르기 후보: 이 공간에 댓글을 쓴 적 있는 사람들 (memberId 가 있는 사람만) */
  people(space: SpaceId): Mention[] {
    const dir = joinInside(this.root, [space]);
    const found = new Map<string, string>();
    const walk = (d: string) => {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".json")) {
          try {
            for (const c of this.read(full).comments) {
              for (const x of [c, ...c.replies]) {
                if (x.author.memberId) found.set(x.author.memberId, x.author.name);
                for (const m of x.mentions ?? []) if (!found.has(m.memberId)) found.set(m.memberId, m.name);
              }
            }
          } catch {
            /* 깨진 파일은 건너뛴다 */
          }
        }
      }
    };
    walk(dir);
    return [...found].map(([memberId, name]) => ({ memberId, name })).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  remove(space: SpaceId, slug: string | string[], id: string, actor: Actor, perm: CommentPermission): Promise<{ removed: boolean }> {
    const file = this.fileOf(space, slug);
    return this.mutate(file, (data) => {
      const target = findAny(data, id);
      if (!target) throw new StoreError("not_found", "댓글을 찾을 수 없습니다.");
      if (!perm.moderator && !isOwner(target.item, actor)) {
        throw new StoreError("forbidden", "내 댓글만 지울 수 있습니다.");
      }
      if (target.kind === "reply") {
        target.parent.replies = target.parent.replies.filter((r) => r.id !== id);
        if (target.parent.deleted && target.parent.replies.length === 0) {
          data.comments = data.comments.filter((c) => c.id !== target.parent.id);
        }
      } else if (target.item.replies.length > 0) {
        target.item.deleted = true;
        target.item.body = "";
        target.item.updatedAt = new Date().toISOString();
      } else {
        data.comments = data.comments.filter((c) => c.id !== id);
      }
      return { removed: true };
    });
  }

  /** 문서를 옮기면 댓글도 따라간다 (이미 있으면 합친다) */
  async move(space: SpaceId, from: string[], to: string[]): Promise<void> {
    const src = this.fileOf(space, from);
    const dst = this.fileOf(space, to);
    if (src === dst || !fs.existsSync(src)) return;
    await repoMutex.run(`comments:${src}`, () =>
      repoMutex.run(`comments:${dst}`, async () => {
        const a = this.read(src);
        const b = this.read(dst);
        await this.write(dst, { version: 1, comments: [...b.comments, ...a.comments] });
        await removeFile(src);
      })
    );
  }
}

type Found =
  | { kind: "comment"; item: Comment }
  | { kind: "reply"; item: Reply; parent: Comment };

function findAny(data: CommentFile, id: string): Found | null {
  for (const c of data.comments) {
    if (c.id === id) return { kind: "comment", item: c };
    const r = c.replies.find((x) => x.id === id);
    if (r) return { kind: "reply", item: r, parent: c };
  }
  return null;
}
