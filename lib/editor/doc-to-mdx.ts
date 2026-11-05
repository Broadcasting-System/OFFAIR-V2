/**
 * 편집기 문서(ProseMirror JSON) → MDX 파일.
 *
 * 같은 문서는 늘 같은 글자로 써야 한다(결정적 출력) — 저장할 때마다 git diff 가
 * 흔들리지 않게. 규칙:
 *   - 굵게 `**`, 기울임 `*`, 글머리 `-`, 구분선 `---`, 코드 펜스 ```
 *   - 링크는 늘 `[글](주소)` (MDX 는 `<주소>` 자동 링크를 못 쓴다)
 *   - 표는 `| --- |` 구분 줄, 칸 정렬용 공백 채움 없음
 *   - JSX 속성 순서는 컴포넌트마다 정해진 순서 → 그 밖의 속성은 원래 순서
 *   - 원문 블록/조각은 받은 글자 그대로
 */
import type { JSONContent } from "@tiptap/core";
import type {
  Root,
  RootContent,
  PhrasingContent,
  BlockContent,
  ListItem,
  TableRow,
  TableCell,
  Text,
  Parents,
  Literal,
} from "mdast";
import type { MdxJsxFlowElement, MdxJsxTextElement, MdxJsxAttribute } from "mdast-util-mdx-jsx";
import { toMarkdown, type Handle, type Options as ToMarkdownOptions, type State, type Info } from "mdast-util-to-markdown";
import { mdxToMarkdown } from "mdast-util-mdx";
import { gfmToMarkdown } from "mdast-util-gfm";
import { stringifyFrontmatter, type DocMetaFields } from "./frontmatter";
import type { ExtraAttr } from "./schema";

/* 우리만 쓰는 mdast 노드: 원문 그대로 내보낸다 */
interface RawNode extends Literal {
  type: "wikiRaw";
}
declare module "mdast" {
  interface RootContentMap {
    wikiRaw: RawNode;
  }
  interface PhrasingContentMap {
    wikiRaw: RawNode;
  }
  interface BlockContentMap {
    wikiRaw: RawNode;
  }
}

type PMMark = { type: string; attrs?: Record<string, unknown> };

/* ───────────────────────── 진입점 ───────────────────────── */

export function docToMdx(input: { meta: DocMetaFields; doc: JSONContent }): string {
  const body = docToBody(input.doc);
  const m = input.meta;
  // 원래 머리말이 없던 파일(예: contribution.mdx)은 빈 머리말을 새로 만들지 않는다
  const empty = !m.title && !m.description && !m.category && m.order == null && !Object.keys(m.extra).length;
  if (empty) return body;
  return `---\n${stringifyFrontmatter(m)}---\n\n${body}`;
}

/** 본문만 (머리말 없이). 끝에 줄바꿈 하나. 비어 있으면 빈 문자열. */
export function docToBody(doc: JSONContent): string {
  const root: Root = { type: "root", children: blocks(doc.content ?? [], {}) };
  if (!root.children.length) return "";
  const out = toMarkdown(root, MARKDOWN_OPTIONS);
  return out.replace(/\n+$/, "") + "\n";
}

/* ───────────────────────── 블록 ───────────────────────── */

interface BCtx {
  inTable?: boolean;
}

function isEmptyParagraph(n: JSONContent): boolean {
  return n.type === "paragraph" && !(n.content && n.content.length);
}

function blocks(nodes: JSONContent[], ctx: BCtx): RootContent[] {
  const out: RootContent[] = [];
  for (const n of nodes) {
    const b = block(n, ctx);
    if (b) out.push(b);
  }
  return out;
}

/** 컴포넌트 안 내용: 빈 문단 하나뿐이면 자식 없음 */
function flowChildren(nodes: JSONContent[] | undefined): RootContent[] {
  const list = nodes ?? [];
  if (list.length === 1 && isEmptyParagraph(list[0])) return [];
  return blocks(list, {});
}

function block(n: JSONContent, ctx: BCtx): RootContent | null {
  const a = n.attrs ?? {};
  switch (n.type) {
    case "paragraph": {
      if (isEmptyParagraph(n)) return null;
      return { type: "paragraph", children: inline(n.content ?? [], ctx) };
    }
    case "heading":
      return { type: "heading", depth: clampDepth(a.level), children: inline(n.content ?? [], ctx) };
    case "horizontalRule":
      return { type: "thematicBreak" };
    case "blockquote": {
      const kids = blocks(n.content ?? [], ctx) as BlockContent[];
      return { type: "blockquote", children: kids };
    }
    case "bulletList":
    case "orderedList":
    case "taskList": {
      const spread = Boolean(a.spread);
      const ordered = n.type === "orderedList";
      const items: ListItem[] = (n.content ?? []).map((item) => {
        const kids = (item.content ?? []).filter((c, i) => !(i === 0 && isEmptyParagraph(c) && (item.content?.length ?? 0) > 1));
        const children = blocks(kids, ctx) as ListItem["children"];
        return {
          type: "listItem",
          spread,
          checked: n.type === "taskList" ? Boolean(item.attrs?.checked) : null,
          children,
        };
      });
      return {
        type: "list",
        ordered,
        start: ordered ? Number(a.start ?? 1) : null,
        spread,
        children: items,
      };
    }
    case "codeBlock": {
      const value = (n.content ?? []).map((t) => t.text ?? "").join("");
      return { type: "code", lang: (a.language as string) || null, meta: (a.meta as string) || null, value };
    }
    case "table":
      return table(n);
    case "image":
      return {
        type: "paragraph",
        children: [{ type: "image", url: String(a.src ?? ""), alt: (a.alt as string) ?? "", title: (a.title as string) || null }],
      };
    case "youtube":
      return {
        type: "paragraph",
        children: [
          {
            type: "link",
            url: String(a.url ?? ""),
            title: "youtube",
            children: [{ type: "text", value: String(a.title || "유튜브 영상") }],
          },
        ],
      };
    case "callout":
      return jsxFlow("Callout", [["type", a.type], ["title", a.title]], a.extraAttrs, flowChildren(n.content));
    case "steps":
      return jsxFlow(
        "Steps",
        [],
        a.extraAttrs,
        (n.content ?? []).map((s) =>
          jsxFlow("Step", [["title", s.attrs?.title ?? ""]], s.attrs?.extraAttrs, flowChildren(s.content)),
        ),
      );
    case "figure":
      return jsxFlow(
        "Figure",
        [
          ["src", a.src ?? ""],
          ["alt", a.alt ?? ""],
          ["caption", a.caption],
          ["width", a.width],
          ["height", a.height],
          ["static", a.static ? true : null],
        ],
        a.extraAttrs,
        [],
      );
    case "cardGrid":
      return jsxFlow(
        "CardGrid",
        [],
        a.extraAttrs,
        (n.content ?? []).map((c) =>
          jsxFlow("Card", [["href", c.attrs?.href], ["title", c.attrs?.title ?? ""]], c.attrs?.extraAttrs, flowChildren(c.content)),
        ),
      );
    case "rawBlock":
      return { type: "wikiRaw", value: String(a.source ?? "") };
    default:
      // 모르는 노드 — 글자만이라도 남긴다
      if (n.content) return { type: "paragraph", children: inline(n.content, ctx) };
      return null;
  }
}

function clampDepth(level: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  const l = Math.round(Number(level) || 2);
  return Math.min(6, Math.max(1, l)) as 1 | 2 | 3 | 4 | 5 | 6;
}

function table(n: JSONContent): RootContent {
  const rows = n.content ?? [];
  const cols = Math.max(1, ...rows.map((r) => (r.content ?? []).length));
  const alignAttr = (n.attrs?.align as (string | null)[] | null) ?? null;
  const align = Array.from({ length: cols }, (_, i) => (alignAttr?.[i] ?? null) as "left" | "right" | "center" | null);
  const children: TableRow[] = rows.map((r) => {
    const cells: TableCell[] = (r.content ?? []).map((c) => ({
      type: "tableCell",
      children: inline(c.content ?? [], { inTable: true }),
    }));
    while (cells.length < cols) cells.push({ type: "tableCell", children: [] });
    return { type: "tableRow", children: cells };
  });
  return { type: "table", align, children };
}

/* ───────────────────────── JSX ───────────────────────── */

type AttrValue = unknown;

function jsxAttr(name: string, value: AttrValue): MdxJsxAttribute | null {
  if (value === null || value === undefined || value === false) return null;
  if (value === true) return { type: "mdxJsxAttribute", name, value: null };
  if (typeof value === "number") {
    return { type: "mdxJsxAttribute", name, value: { type: "mdxJsxAttributeValueExpression", value: String(value) } };
  }
  return { type: "mdxJsxAttribute", name, value: String(value) };
}

function extraToAttrs(extra: unknown): MdxJsxAttribute[] {
  if (!Array.isArray(extra)) return [];
  return (extra as ExtraAttr[]).map((e) => {
    if (e.value === null) return { type: "mdxJsxAttribute", name: e.name, value: null };
    if (typeof e.value === "string") return { type: "mdxJsxAttribute", name: e.name, value: e.value };
    return { type: "mdxJsxAttribute", name: e.name, value: { type: "mdxJsxAttributeValueExpression", value: e.value.expr } };
  });
}

function jsxFlow(
  name: string,
  attrs: [string, AttrValue][],
  extra: unknown,
  children: RootContent[],
): MdxJsxFlowElement {
  const list = attrs.map(([k, v]) => jsxAttr(k, v)).filter((x): x is MdxJsxAttribute => x !== null);
  return {
    type: "mdxJsxFlowElement",
    name,
    attributes: [...list, ...extraToAttrs(extra)],
    children: children as MdxJsxFlowElement["children"],
  };
}

function jsxText(name: string, attrs: [string, AttrValue][], children: PhrasingContent[]): MdxJsxTextElement {
  const list = attrs.map(([k, v]) => jsxAttr(k, v)).filter((x): x is MdxJsxAttribute => x !== null);
  return { type: "mdxJsxTextElement", name, attributes: list, children };
}

/* ───────────────────────── 글자(인라인) ───────────────────────── */

/** 표시를 감싸는 순서(바깥 → 안). code 는 맨 안쪽 잎(inlineCode)이 된다 */
const MARK_RANK = ["link", "badge", "kbd", "bold", "italic", "strike", "underline"];

function rank(m: PMMark): number {
  const i = MARK_RANK.indexOf(m.type);
  return i === -1 ? MARK_RANK.length : i;
}

function markKey(m: PMMark): string {
  return m.type + JSON.stringify(m.attrs ?? {});
}

function wrapperFor(m: PMMark): Parents & { children: PhrasingContent[] } {
  const a = m.attrs ?? {};
  switch (m.type) {
    case "bold":
      return { type: "strong", children: [] };
    case "italic":
      return { type: "emphasis", children: [] };
    case "strike":
      return { type: "delete", children: [] };
    case "link":
      return { type: "link", url: String(a.href ?? ""), title: (a.title as string) || null, children: [] };
    case "underline":
      return jsxText("u", [], []);
    case "kbd":
      return jsxText("Kbd", [], []);
    case "badge":
      return jsxText("Badge", [["tone", a.tone]], []);
    default:
      // 모르는 표시는 감싸지 않는다(글자만 남김)
      return { type: "emphasis", children: [] };
  }
}

function inline(nodes: JSONContent[], ctx: BCtx): PhrasingContent[] {
  const root: { children: PhrasingContent[] } = { children: [] };
  /** 지금 열려 있는 표시와 그 mdast 상자 */
  const open: { mark: PMMark; node: { children: PhrasingContent[] } }[] = [];
  const marksOf = (n: JSONContent) =>
    ((n.marks ?? []) as PMMark[]).filter((m) => m.type !== "code" && MARK_RANK.includes(m.type));

  nodes.forEach((n, idx) => {
    const marks = marksOf(n);
    // 1) 열린 표시 중 이 조각에도 있는 것까지(앞에서부터) 유지, 나머지는 닫는다
    let keep = 0;
    while (keep < open.length && marks.some((m) => markKey(m) === markKey(open[keep].mark))) keep++;
    open.length = keep;
    // 2) 새로 열 표시 — 뒤로 오래 이어지는 것부터 바깥에 (같으면 정해진 순서)
    const opened = new Set(open.map((o) => markKey(o.mark)));
    const fresh = marks.filter((m) => !opened.has(markKey(m)));
    const runLength = (m: PMMark) => {
      let k = idx;
      while (k < nodes.length && marksOf(nodes[k]).some((x) => markKey(x) === markKey(m))) k++;
      return k - idx;
    };
    fresh.sort((x, y) => runLength(y) - runLength(x) || rank(x) - rank(y));
    for (const m of fresh) {
      const box = wrapperFor(m);
      const parent = open.length ? open[open.length - 1].node : root;
      parent.children.push(box as PhrasingContent);
      open.push({ mark: m, node: box });
    }
    // 3) 잎
    const parent = open.length ? open[open.length - 1].node : root;
    const leaf = leafFor(n, ctx);
    if (leaf) parent.children.push(leaf);
  });

  return tidy(root.children);
}

function leafFor(n: JSONContent, ctx: BCtx): PhrasingContent | null {
  switch (n.type) {
    case "text": {
      const isCode = (n.marks ?? []).some((m) => m.type === "code");
      return isCode ? { type: "inlineCode", value: n.text ?? "" } : { type: "text", value: n.text ?? "" };
    }
    case "hardBreak":
      // 표 칸 안에서는 줄을 바꿀 수 없으므로 <br />
      return ctx.inTable ? jsxText("br", [], []) : { type: "break" };
    case "rawInline":
      return { type: "wikiRaw", value: String(n.attrs?.source ?? "") };
    default:
      return n.text ? { type: "text", value: n.text } : null;
  }
}

/**
 * 마무리 손질:
 *  - 굵게/기울임/취소선 안쪽 끝의 공백을 바깥으로 (`**글 **` 은 마크다운에서 안 먹는다)
 *  - 이웃한 text 합치기, 빈 상자 없애기
 */
function tidy(nodes: PhrasingContent[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  for (const node of nodes) {
    if ("children" in node && Array.isArray(node.children)) {
      const kids = tidy(node.children as PhrasingContent[]);
      if (!kids.length && node.type !== "mdxJsxTextElement") continue;
      const hoistable = node.type === "strong" || node.type === "emphasis" || node.type === "delete";
      let lead = "";
      let trail = "";
      if (hoistable) {
        const first = kids[0];
        if (first && first.type === "text") {
          const m = /^\s+/.exec(first.value);
          if (m) {
            lead = m[0];
            first.value = first.value.slice(lead.length);
            if (!first.value) kids.shift();
          }
        }
        const last = kids[kids.length - 1];
        if (last && last.type === "text") {
          const m = /\s+$/.exec(last.value);
          if (m) {
            trail = m[0];
            last.value = last.value.slice(0, -trail.length);
            if (!last.value) kids.pop();
          }
        }
      }
      if (lead) pushText(out, lead);
      if (kids.length || !hoistable) out.push({ ...node, children: kids } as PhrasingContent);
      if (trail) pushText(out, trail);
    } else if (node.type === "text") {
      pushText(out, node.value);
    } else out.push(node);
  }
  return out;
}

function pushText(out: PhrasingContent[], value: string) {
  if (!value) return;
  const prev = out[out.length - 1];
  if (prev && prev.type === "text") prev.value += value;
  else out.push({ type: "text", value } as Text);
}

/* ───────────────────────── 문자열로 ───────────────────────── */

const gfm = gfmToMarkdown({ tablePipeAlign: false });

/** gfm 표 처리기(정렬 공백 없이)를 감싸 구분 줄을 `---` 로 */
const tableHandler: Handle = (node, parent, state, info) => {
  const base = findHandler(gfm, "table");
  const out = base(node, parent, state, info);
  const lines = out.split("\n");
  if (lines.length > 1) {
    lines[1] = lines[1].replace(/(:?)-+(:?)/g, (_m, l: string, r: string) => `${l}${"-".repeat(3 - l.length - r.length)}${r}`);
  }
  return lines.join("\n");
};

function findHandler(ext: ToMarkdownOptions, name: string): Handle {
  const stack: ToMarkdownOptions[] = [ext];
  while (stack.length) {
    const e = stack.pop()!;
    const h = e.handlers?.[name as keyof NonNullable<ToMarkdownOptions["handlers"]>];
    if (h) return h as Handle;
    if (e.extensions) stack.push(...e.extensions);
  }
  throw new Error(`처리기 없음: ${name}`);
}

/**
 * 글자 처리기 — 기본 이스케이프를 쓰되, 짝이 없는 `~` 하나(예: "1~5")까지
 * `\~` 로 바꾸지는 않는다 (취소선은 `~` 두 개 이상이 있어야 생긴다).
 */
const textHandler: Handle = (node, _parent, state: State, info: Info) => {
  const value = (node as Text).value;
  const saved = state.unsafe;
  if ((value.match(/~/g) ?? []).length < 2) state.unsafe = saved.filter((p) => p.character !== "~");
  try {
    return state.safe(value, info);
  } finally {
    state.unsafe = saved;
  }
};

/** JSX 블록 처리기 — 몇 가지를 손본다 */
const baseJsxHandler = findHandler(mdxToMarkdown(), "mdxJsxFlowElement");
const jsxFlowHandler: Handle = (node, parent, state, info) => {
  // 앞 형제 목록의 글머리를 기억해 안쪽 목록이 `*` 로 바뀌는 것을 막는다
  state.bulletLastUsed = undefined;
  const el = node as MdxJsxFlowElement;
  // <Steps>/<CardGrid> 의 자식(<Step>/<Card>)은 빈 줄 없이 이어 쓴다 (기존 문서 모양)
  if ((el.name === "Steps" || el.name === "CardGrid") && !el.attributes.length && el.children.length) {
    const indent = "  ".repeat(jsxDepth(state));
    const exit = state.enter("mdxJsxFlowElement");
    const kids = el.children.map((c) => state.handle(c, el, state, { ...info, before: "\n", after: "\n" }));
    exit();
    return `${indent}<${el.name}>\n${kids.join("\n")}\n${indent}</${el.name}>`;
  }
  const out = baseJsxHandler(node, parent, state, info);
  // <Callout> 안 내용은 들여쓰지 않는다 (기존 문서 모양). 첫 줄·끝 줄은 여는/닫는 태그.
  if (el.name === "Callout" && el.children.length) {
    const indent = "  ".repeat(jsxDepth(state));
    const lines = out.split("\n");
    for (let i = 1; i < lines.length - 1; i++) {
      if (lines[i].startsWith(indent + "  ")) lines[i] = indent + lines[i].slice(indent.length + 2);
    }
    return lines.join("\n");
  }
  return out;
};

/** mdast-util-mdx-jsx 와 같은 방식으로 지금 JSX 깊이를 센다 */
function jsxDepth(state: State): number {
  let depth = 0;
  for (let i = state.stack.length - 1; i > -1; i--) {
    const name = state.stack[i];
    if (name === "blockquote" || name === "listItem") break;
    if (name === "mdxJsxFlowElement") depth++;
  }
  return depth;
}

const rawHandler: Handle = (node) => (node as unknown as RawNode).value;

const MARKDOWN_OPTIONS: ToMarkdownOptions = {
  extensions: [mdxToMarkdown(), gfm],
  bullet: "-",
  bulletOther: "*",
  emphasis: "*",
  strong: "*",
  rule: "-",
  fence: "`",
  fences: true,
  listItemIndent: "one",
  incrementListMarker: true,
  resourceLink: true,
  setext: false,
  handlers: {
    table: tableHandler,
    text: textHandler,
    mdxJsxFlowElement: jsxFlowHandler,
    wikiRaw: rawHandler,
  } as ToMarkdownOptions["handlers"],
};
