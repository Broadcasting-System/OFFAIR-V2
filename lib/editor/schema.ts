/**
 * 편집기 문서 구조(스키마) — React 없이 쓰는 순수 정의.
 *
 * - 변환기(lib/editor/mdx-to-doc.ts, doc-to-mdx.ts)와 테스트가 이 정의를 기준으로
 *   ProseMirror JSON 을 만들고 검사한다.
 * - 화면용 노드 뷰(React)는 components/editor/extensions.ts 에서 이 노드들을
 *   `.extend({ addNodeView })` 로 덧입힌다. 이름·속성은 여기서만 바꾼다.
 *
 * MDX 컴포넌트 ↔ 노드
 *   <Callout type title>        → callout   (내용: 블록)
 *   <Steps> / <Step title>      → steps / step
 *   <Figure src alt caption …/> → figure    (원자 노드)
 *   <CardGrid> / <Card href title> → cardGrid / card
 *   <Kbd>, <Badge tone>, <u>    → 글자 표시(mark) kbd / badge / underline
 *   알 수 없는 MDX·JSX         → rawBlock / rawInline (원문 그대로 보존)
 */
import { Node, Mark, mergeAttributes, type AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskList, TaskItem, BulletList, OrderedList } from "@tiptap/extension-list";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Code from "@tiptap/extension-code";
import CodeBlock from "@tiptap/extension-code-block";

/* ───────────── 속성 도우미: data-* 에 JSON 으로 넣고 빼서 복사·붙여넣기에도 살아남게 ───────────── */

function jsonAttr<T>(name: string, def: T) {
  const key = `data-${name.toLowerCase()}`;
  return {
    default: def,
    parseHTML: (el: HTMLElement) => {
      const raw = el.getAttribute(key);
      if (raw == null) return def;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return def;
      }
    },
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs[name] === def || attrs[name] === undefined
        ? {}
        : { [key]: JSON.stringify(attrs[name]) },
  };
}

/** 원래 JSX 에 있던, 우리가 따로 다루지 않는 속성들 (그대로 다시 써 준다) */
export interface ExtraAttr {
  name: string;
  /** 문자열 값 · null(값 없는 불리언 속성) · {expr}(중괄호 식) */
  value: string | null | { expr: string };
}

/* ───────────────────────── 블록 컴포넌트 ───────────────────────── */

export type CalloutType = "note" | "info" | "tip" | "warn" | "danger";
export const CALLOUT_TYPES: CalloutType[] = ["note", "info", "tip", "warn", "danger"];

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      type: jsonAttr<CalloutType | null>("type", null),
      title: jsonAttr<string | null>("title", null),
      extraAttrs: jsonAttr<ExtraAttr[] | null>("extraAttrs", null),
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-callout": node.attrs.type ?? "note",
        class: `we-callout we-callout--${node.attrs.type ?? "note"}`,
      }),
      0,
    ];
  },
});

export const Steps = Node.create({
  name: "steps",
  group: "block",
  content: "step+",
  defining: true,
  addAttributes() {
    return { extraAttrs: jsonAttr<ExtraAttr[] | null>("extraAttrs", null) };
  },
  parseHTML() {
    return [{ tag: "div[data-steps]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-steps": "", class: "we-steps" }), 0];
  },
});

export const Step = Node.create({
  name: "step",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      title: jsonAttr<string>("title", ""),
      extraAttrs: jsonAttr<ExtraAttr[] | null>("extraAttrs", null),
    };
  },
  parseHTML() {
    return [{ tag: "div[data-step]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-step": "", class: "we-step" }), 0];
  },
});

export const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: jsonAttr<string>("src", ""),
      alt: jsonAttr<string>("alt", ""),
      caption: jsonAttr<string | null>("caption", null),
      /** 표시 달기로 만든 그림이면 사이드카(이름.marks.json) 주소 — 다시 고칠 때 쓴다 */
      sidecar: jsonAttr<string | null>("sidecar", null),
      width: jsonAttr<number | null>("width", null),
      height: jsonAttr<number | null>("height", null),
      static: jsonAttr<boolean>("static", false),
      extraAttrs: jsonAttr<ExtraAttr[] | null>("extraAttrs", null),
    };
  },
  parseHTML() {
    return [{ tag: "figure[data-figure]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, { "data-figure": "" }),
      ["img", { src: node.attrs.src, alt: node.attrs.alt }],
      ["figcaption", {}, node.attrs.caption ?? ""],
    ];
  },
});

export const CardGrid = Node.create({
  name: "cardGrid",
  group: "block",
  content: "card+",
  defining: true,
  addAttributes() {
    return { extraAttrs: jsonAttr<ExtraAttr[] | null>("extraAttrs", null) };
  },
  parseHTML() {
    return [{ tag: "div[data-card-grid]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-card-grid": "", class: "we-card-grid" }), 0];
  },
});

export const Card = Node.create({
  name: "card",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      href: jsonAttr<string | null>("href", null),
      title: jsonAttr<string>("title", ""),
      extraAttrs: jsonAttr<ExtraAttr[] | null>("extraAttrs", null),
    };
  },
  parseHTML() {
    return [{ tag: "div[data-card]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-card": "", class: "we-card" }), 0];
  },
});

/**
 * 유튜브 영상 — `<YouTube id="…" start={30} title="…" />` 로 저장한다 (components/mdx/youtube.tsx).
 * 예전 약속 `[제목](주소 "youtube")` 도 읽어서 이 블록으로 연다.
 */
export const Youtube = Node.create({
  name: "youtube",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      url: jsonAttr<string>("url", ""),
      title: jsonAttr<string>("title", ""),
      /** 시작 위치(초). 없으면 주소의 t= 를 쓴다 */
      start: jsonAttr<number | null>("start", null),
    };
  },
  parseHTML() {
    return [{ tag: "div[data-youtube]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-youtube": "" }), node.attrs.url];
  },
});

/** 원문 블록 — 편집기가 모르는 MDX 를 한 글자도 바꾸지 않고 보관한다 */
export const RawBlock = Node.create({
  name: "rawBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { source: jsonAttr<string>("source", "") };
  },
  parseHTML() {
    return [{ tag: "div[data-raw-block]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-raw-block": "" }), ["pre", {}, node.attrs.source]];
  },
});

/** 글 안의 원문 조각 (모르는 인라인 JSX·식·각주 참조 등) */
export const RawInline = Node.create({
  name: "rawInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { source: jsonAttr<string>("source", "") };
  },
  parseHTML() {
    return [{ tag: "span[data-raw-inline]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-raw-inline": "", class: "we-raw-inline" }), node.attrs.source];
  },
  renderText({ node }) {
    return node.attrs.source;
  },
});

/* ───────────────────────── 글자 표시 ───────────────────────── */

export const Kbd = Mark.create({
  name: "kbd",
  parseHTML() {
    return [{ tag: "kbd" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["kbd", mergeAttributes(HTMLAttributes, { class: "we-kbd" }), 0];
  },
});

export type BadgeTone = "beam" | "muted" | "warn";

export const Badge = Mark.create({
  name: "badge",
  addAttributes() {
    return { tone: jsonAttr<BadgeTone | null>("tone", null) };
  },
  parseHTML() {
    return [{ tag: "span[data-badge]" }];
  },
  renderHTML({ HTMLAttributes, mark }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-badge": "", class: `we-badge we-badge--${mark.attrs.tone ?? "beam"}` }),
      0,
    ];
  },
});

/* ───────────────────────── 기본 블록 손보기 ───────────────────────── */

/** 목록: 항목 사이 빈 줄(느슨한 목록) 여부를 보존 */
const spreadAttr = { spread: { default: false, rendered: false } };
export const WikiBulletList = BulletList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...spreadAttr };
  },
});
export const WikiOrderedList = OrderedList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...spreadAttr };
  },
});
export const WikiTaskList = TaskList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...spreadAttr };
  },
});

/** 표: GFM 표는 칸마다 한 줄 글만 담을 수 있으므로 칸 내용을 inline* 으로 */
export const WikiTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      /** 열 정렬 — GFM `:---:` 같은 것 */
      align: jsonAttr<("left" | "right" | "center" | null)[] | null>("align", null),
    };
  },
});
export const WikiTableCell = TableCell.extend({ content: "inline*" });
export const WikiTableHeader = TableHeader.extend({ content: "inline*" });

/** 인라인 코드: 굵게 등과 겹칠 수 있게 (`**\`시보 전송\`**` 이 실제 문서에 있다) */
export const WikiCode = Code.extend({ excludes: "" });

/** 코드 블록: 펜스 뒤 언어 + 나머지(meta, 예: title="a.ts")까지 보존 */
export const WikiCodeBlock = CodeBlock.extend({
  addAttributes() {
    return { ...this.parent?.(), meta: jsonAttr<string | null>("meta", null) };
  },
}).configure({ HTMLAttributes: { class: "we-code" } });

/** 마크다운 이미지 `![alt](src)` — 새로 넣는 이미지는 Figure 를 쓴다 */
export const WikiImage = Image.extend({
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
    };
  },
}).configure({ inline: false, allowBase64: false });

/**
 * 스키마를 이루는 확장 목록. 화면(편집기)과 테스트가 같은 목록을 쓴다.
 * `views` 로 같은 이름의 노드를 노드 뷰가 붙은 버전으로 갈아끼울 수 있다.
 */
export function wikiExtensions(views: Partial<Record<string, AnyExtension>> = {}): AnyExtension[] {
  const base: AnyExtension[] = [
    StarterKit.configure({
      bulletList: false,
      orderedList: false,
      code: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { target: null, rel: null, class: "we-link" },
      },
      codeBlock: false,
      dropcursor: { color: "var(--we-accent)", width: 2 },
    }),
    WikiCode,
    WikiCodeBlock,
    WikiBulletList,
    WikiOrderedList,
    WikiTaskList,
    TaskItem.configure({ nested: true }),
    WikiTable.configure({ resizable: false, HTMLAttributes: { class: "we-table" } }),
    TableRow,
    WikiTableHeader,
    WikiTableCell,
    WikiImage,
    Callout,
    Steps,
    Step,
    Figure,
    CardGrid,
    Card,
    Youtube,
    RawBlock,
    RawInline,
    Kbd,
    Badge,
  ];
  return base.map((ext) => views[ext.name] ?? ext);
}
