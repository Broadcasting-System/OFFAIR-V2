/**
 * 블록 넣기 · 화면 맞추기.
 *
 * 시안에서 배운 두 가지:
 *  1) 블록은 커서가 있는 줄 '다음'에 넣는다. 제목 줄 안에 넣으면 제목이 둘로 쪼개진다.
 *     (커서 줄이 빈 문단이면 그 자리를 바꿔 끼운다)
 *  2) 편집기에 포커스를 줄 때 화면이 맨 위로 튀지 않게 preventScroll 로 주고,
 *     넣은 블록이 화면 밖이거나 아래 도구 막대에 가렸을 때만 그만큼 내린다.
 */
import type { Editor, JSONContent } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection, type EditorState, type Selection } from "@tiptap/pm/state";

/** 안에 블록을 담는 그릇 — 이 안에서는 '그릇의 자식' 단위로 넣는다. 목록·표·인용은 통째로 한 블록. */
const CONTAINERS = new Set(["doc", "callout", "step", "card"]);

export interface BlockContext {
  /** 지금 블록의 시작/끝 위치 */
  from: number;
  to: number;
  node: PMNode | null;
  /** 빈 문단이면 그 자리를 바꿔 끼운다 */
  empty: boolean;
}

export function currentBlock(state: EditorState): BlockContext {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.isBlock) {
    return { from: sel.from, to: sel.to, node: sel.node, empty: false };
  }
  const $from = sel.$from;
  for (let d = $from.depth; d > 0; d--) {
    if (CONTAINERS.has($from.node(d - 1).type.name)) {
      const node = $from.node(d);
      const empty = node.type.name === "paragraph" && node.content.size === 0;
      return { from: $from.before(d), to: $from.after(d), node, empty };
    }
  }
  const end = state.doc.content.size;
  return { from: end, to: end, node: null, empty: false };
}

/**
 * 블록(들)을 지금 블록 다음에 넣고, 넣은 것 안의 첫 글줄에 커서를 둔다.
 * 반환: 넣은 자리의 시작 위치 (실패하면 null)
 */
export function insertBlocks(
  editor: Editor,
  content: JSONContent | JSONContent[],
  opts: { replaceEmpty?: boolean; at?: BlockContext } = {},
): number | null {
  const { state, view } = editor;
  const list = Array.isArray(content) ? content : [content];
  let fragment: Fragment;
  try {
    fragment = Fragment.fromArray(list.map((n) => state.schema.nodeFromJSON(n)));
  } catch {
    return null;
  }
  const ctx = opts.at ?? currentBlock(state);
  const replace = ctx.empty && opts.replaceEmpty !== false;
  const at = replace ? ctx.from : ctx.to;
  const tr = state.tr;
  try {
    if (replace) tr.replaceWith(ctx.from, ctx.to, fragment);
    else tr.insert(at, fragment);
  } catch {
    return null;
  }
  const end = at + fragment.size;
  let sel: Selection | null = null;
  tr.doc.nodesBetween(at, Math.min(end, tr.doc.content.size), (node, pos) => {
    if (sel) return false;
    if (node.isTextblock) {
      sel = TextSelection.create(tr.doc, pos + 1);
      return false;
    }
    return true;
  });
  if (!sel) {
    try {
      sel = NodeSelection.create(tr.doc, at);
    } catch {
      sel = TextSelection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size)));
    }
  }
  if (sel) tr.setSelection(sel);
  view.dispatch(tr);
  focusNoScroll(editor);
  return at;
}

/** 화면을 움직이지 않고 편집기에 포커스 (ProseMirror 는 preventScroll 로 포커스한다) */
export function focusNoScroll(editor: Editor) {
  if (!editor.view.hasFocus()) editor.view.focus();
}

/**
 * pos 에 있는 블록이 스크롤 영역 밖이거나 아래 도구 막대 뒤에 있으면 그만큼만 스크롤.
 */
export function reveal(editor: Editor, pos: number | null, scroller: HTMLElement | null, toolbar: HTMLElement | null) {
  if (pos == null || !scroller) return;
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() => {
    let el = editor.view.nodeDOM(pos) as HTMLElement | null;
    if (el && el.nodeType !== 1) el = el.parentElement;
    if (!el) return;
    const box = scroller.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const pad = (toolbar?.offsetHeight ?? 0) + 32;
    const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
    if (r.bottom > box.bottom - pad) {
      // 블록이 화면보다 크면 머리만 보이게
      const delta = Math.min(r.bottom - (box.bottom - pad), r.top - box.top - 16);
      if (delta > 0) scroller.scrollBy({ top: delta, behavior });
    } else if (r.top < box.top + 16) {
      scroller.scrollBy({ top: r.top - box.top - 16, behavior });
    }
    if (!reduce && el.animate) {
      el.animate([{ backgroundColor: "var(--we-sel)" }, { backgroundColor: "transparent" }], { duration: 500 });
    }
  });
}

/* ───────────── 넣을 블록 모양 ───────────── */

export const blocksFor = {
  callout: (type: string): JSONContent => ({ type: "callout", attrs: { type, title: null }, content: [{ type: "paragraph" }] }),
  table: (rows = 3, cols = 3, header = true): JSONContent => ({
    type: "table",
    content: Array.from({ length: rows }, (_, r) => ({
      type: "tableRow",
      content: Array.from({ length: cols }, () => ({ type: r === 0 && header ? "tableHeader" : "tableCell" })),
    })),
  }),
  steps: (): JSONContent => ({
    type: "steps",
    content: [
      { type: "step", attrs: { title: "" }, content: [{ type: "paragraph" }] },
      { type: "step", attrs: { title: "" }, content: [{ type: "paragraph" }] },
    ],
  }),
  figure: (src: string, alt: string, width?: number | null, height?: number | null): JSONContent => ({
    type: "figure",
    attrs: { src, alt, caption: null, width: width ?? null, height: height ?? null },
  }),
  codeBlock: (): JSONContent => ({ type: "codeBlock", attrs: { language: null } }),
  quote: (): JSONContent => ({ type: "blockquote", content: [{ type: "paragraph" }] }),
  hr: (): JSONContent[] => [{ type: "horizontalRule" }, { type: "paragraph" }],
  cardGrid: (href = "", title = ""): JSONContent => ({
    type: "cardGrid",
    content: [{ type: "card", attrs: { href: href || null, title }, content: [{ type: "paragraph" }] }],
  }),
  youtube: (url: string, title = ""): JSONContent => ({ type: "youtube", attrs: { url, title } }),
  raw: (source = ""): JSONContent => ({ type: "rawBlock", attrs: { source } }),
  linkParagraph: (href: string, text: string): JSONContent => ({
    type: "paragraph",
    content: [{ type: "text", text, marks: [{ type: "link", attrs: { href } }] }],
  }),
};

/** 유튜브 주소에서 영상 id */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (/(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname)) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = /^\/(embed|shorts|live)\/([^/?]+)/.exec(u.pathname);
      if (m) return m[2];
    }
  } catch {
    /* 주소 아님 */
  }
  return null;
}

export function isUrl(text: string): boolean {
  return /^https?:\/\/[^\s]+$/.test(text.trim());
}
