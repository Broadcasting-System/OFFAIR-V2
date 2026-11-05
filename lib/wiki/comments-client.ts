import { makeAnchor, type Anchor } from "./anchor";
import { api } from "./client";
import { apiSlug, type SpaceKey } from "./links";

/**
 * 댓글 API 와 "본문 글 ↔ 글자 위치" 도우미 (브라우저 전용).
 * 읽기 화면의 댓글 기능과, 나중에 편집기의 댓글 모드가 같이 쓴다:
 *
 *   // 편집기: 고른 범위에 댓글 달기
 *   await commentOnRange({ space, slug, root: editorDom, range, body: "여기 확인해 주세요" });
 */

export type { Anchor } from "./anchor";

export interface CommentAuthor {
  name: string;
  memberId: string | null;
}
export interface Mention {
  memberId: string;
  name: string;
}
export interface ReplyT {
  id: string;
  author: CommentAuthor;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  likes?: string[];
  mentions?: Mention[];
}
export interface CommentT extends ReplyT {
  deleted: boolean;
  replies: ReplyT[];
  anchor?: Anchor | null;
  resolved?: { by: CommentAuthor; at: string } | null;
}
export interface CommentList {
  comments: CommentT[];
  people: Mention[];
  me: { memberId: string | null; name: string; canEdit: boolean; canModerate: boolean; canReadMembers: boolean };
}

const url = (space: SpaceKey, slug: string[]) => `/api/wiki/${space}/comments/${apiSlug(slug)}`;

export function listComments(space: SpaceKey, slug: string[]) {
  return api<CommentList>(url(space, slug));
}

export function postComment(
  space: SpaceKey,
  slug: string[],
  input: { body: string; parentId?: string; anchor?: Anchor | null; mentions?: Mention[] }
) {
  return api<CommentT | ReplyT>(url(space, slug), { method: "POST", body: input });
}

export function editComment(space: SpaceKey, slug: string[], id: string, body: string, mentions?: Mention[]) {
  return api<ReplyT>(url(space, slug), { method: "PATCH", body: { id, body, mentions } });
}

export function resolveComment(space: SpaceKey, slug: string[], id: string, resolved: boolean) {
  return api<CommentT>(url(space, slug), { method: "PATCH", body: { id, resolved } });
}

export function likeComment(space: SpaceKey, slug: string[], id: string, like: boolean) {
  return api<ReplyT>(url(space, slug), { method: "PATCH", body: { id, like } });
}

export function deleteComment(space: SpaceKey, slug: string[], id: string) {
  return api<{ removed: boolean }>(`${url(space, slug)}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** 글에 남아 있는 @이름 만 부르기로 남긴다 */
export function keepMentions(body: string, mentions: Mention[]): Mention[] {
  const seen = new Set<string>();
  return mentions.filter((m) => {
    if (seen.has(m.memberId) || !body.includes(`@${m.name}`)) return false;
    seen.add(m.memberId);
    return true;
  });
}

/* ───────────── 본문 글 ↔ 글자 위치 ───────────── */

export interface TextMap {
  text: string;
  /** 글자 조각(텍스트 노드)과 그 시작 위치 */
  nodes: { node: Text; start: number }[];
  /** 최상위 블록마다 text 에서 시작하는 위치 */
  blockStarts: number[];
}

/** 버튼·숨긴 것·댓글 화면 조각은 글에서 뺀다 */
function skip(node: Node, root: HTMLElement): boolean {
  const el = node.parentElement;
  return !!el && el !== root && !!el.closest("button, [aria-hidden='true'], [data-cmt-ui], script, style");
}

export function textMap(root: HTMLElement): TextMap {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (skip(n, root) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: TextMap["nodes"] = [];
  const blockStarts: number[] = [];
  let text = "";
  let lastBlock: Element | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    let block: Element | null = n.parentElement;
    while (block && block.parentElement !== root) block = block.parentElement;
    if (block !== lastBlock) {
      blockStarts.push(text.length);
      lastBlock = block;
    }
    nodes.push({ node: n, start: text.length });
    text += n.data;
  }
  return { text, nodes, blockStarts };
}

function offsetOf(map: TextMap, container: Node, offset: number): number | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const hit = map.nodes.find((x) => x.node === container);
    return hit ? hit.start + offset : null;
  }
  // 요소 경계: 그 자리 뒤에 오는 첫 글자 조각의 시작
  const probe = document.createRange();
  probe.setStart(container, offset);
  probe.collapse(true);
  for (const x of map.nodes) if (probe.comparePoint(x.node, 0) >= 0) return x.start;
  return map.text.length;
}

/** DOM 범위 → 글자 위치 [start, end) */
export function rangeToOffsets(map: TextMap, range: Range): { start: number; end: number } | null {
  const s = offsetOf(map, range.startContainer, range.startOffset);
  const e = offsetOf(map, range.endContainer, range.endOffset);
  if (s === null || e === null || e <= s) return null;
  return { start: s, end: e };
}

/** 글자 위치 → DOM 범위 */
export function offsetsToRange(map: TextMap, start: number, end: number): Range | null {
  const find = (pos: number, isEnd: boolean) => {
    for (const x of map.nodes) {
      const len = x.node.data.length;
      if (pos < x.start + len || (isEnd && pos === x.start + len)) return { node: x.node, off: Math.max(0, pos - x.start) };
    }
    return null;
  };
  const a = find(start, false);
  const b = find(end, true);
  if (!a || !b) return null;
  const r = document.createRange();
  r.setStart(a.node, a.off);
  r.setEnd(b.node, b.off);
  return r;
}

/** 범위 위쪽에서 가장 가까운 소제목 */
function headingBefore(root: HTMLElement, node: Node): string | null {
  const hs = [...root.querySelectorAll("h2, h3")];
  let found: string | null = null;
  for (const h of hs) {
    if (h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) found = h.textContent?.trim() ?? null;
  }
  return found;
}

/** DOM 범위 → 저장할 자리 */
export function anchorFromRange(root: HTMLElement, range: Range, map = textMap(root)): Anchor | null {
  const off = rangeToOffsets(map, range);
  if (!off) return null;
  const block = map.blockStarts.filter((b) => b <= off.start).length - 1;
  return makeAnchor(map.text, off.start, off.end, { block, heading: headingBefore(root, range.startContainer) });
}

/**
 * 편집기 댓글 모드용 — onComment(range, text) 에서 부른다.
 * root 는 문서 본문이 그려진 요소 (읽기 화면과 같은 글자가 나와야 다시 찾을 수 있다).
 */
export async function commentOnRange(input: {
  space: SpaceKey;
  slug: string[];
  root: HTMLElement;
  range: Range;
  body: string;
  mentions?: Mention[];
}) {
  const anchor = anchorFromRange(input.root, input.range);
  if (!anchor) throw new Error("댓글을 달 글을 고르세요.");
  return postComment(input.space, input.slug, { body: input.body, anchor, mentions: keepMentions(input.body, input.mentions ?? []) });
}
