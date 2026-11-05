/**
 * MDX 파일 → 편집기 문서(ProseMirror JSON).
 *
 * 원칙: 내용을 절대 버리지 않는다. 편집기 노드로 옮길 수 없는 것은
 * 원래 글자 그대로 rawBlock / rawInline 에 담아 두었다가 저장할 때 그대로 돌려준다.
 */
import type { JSONContent } from "@tiptap/core";
import type {
  Root,
  RootContent,
  PhrasingContent,
  List,
  ListItem,
  Table,
  Paragraph,
  Link,
} from "mdast";
import type { MdxJsxFlowElement, MdxJsxTextElement, MdxJsxAttribute } from "mdast-util-mdx-jsx";
import { parseMarkdown } from "./mdast";
import { parseFrontmatter, splitFrontmatter, type DocMetaFields } from "./frontmatter";
import type { CalloutType, ExtraAttr, BadgeTone } from "./schema";
import { CALLOUT_TYPES } from "./schema";

export interface ParsedDoc {
  meta: DocMetaFields;
  doc: JSONContent;
}

type Mark = { type: string; attrs?: Record<string, unknown> };

interface Ctx {
  /** 위치 정보로 원문을 잘라 오기 위한 본문 */
  source: string;
  /** 표 칸 안인지 (칸 안의 <br /> 은 줄바꿈으로) */
  inTable?: boolean;
}

/** MDX 파일 전체(머리말 포함)를 읽는다 */
export function mdxToDoc(source: string): ParsedDoc {
  const { yaml, body } = splitFrontmatter(source.replace(/\r\n/g, "\n"));
  return { meta: parseFrontmatter(yaml), doc: bodyToDoc(body) };
}

/** 본문만 (머리말 없이). `mdx: false` 면 일반 마크다운으로 읽는다 (붙여넣기). */
export function bodyToDoc(body: string, opts: { mdx?: boolean } = {}): JSONContent {
  const tree: Root = parseMarkdown(body, opts);
  const ctx: Ctx = { source: body };
  const content = blocks(tree.children, ctx);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/* ───────────────────────── 원문 자르기 ───────────────────────── */

function slice(node: { position?: { start: { offset?: number; column: number }; end: { offset?: number } } }, ctx: Ctx): string {
  const p = node.position;
  if (!p || p.start.offset == null || p.end.offset == null) return "";
  const text = ctx.source.slice(p.start.offset, p.end.offset);
  // 들여쓴 자리(예: <Callout> 안)에서 잘라 온 경우 둘째 줄부터 같은 만큼 들여쓰기를 걷어 낸다
  const indent = p.start.column - 1;
  if (indent <= 0 || !text.includes("\n")) return text;
  return text
    .split("\n")
    .map((line, i) => {
      if (i === 0) return line;
      let n = 0;
      while (n < indent && (line[n] === " " || line[n] === "\t")) n++;
      return line.slice(n);
    })
    .join("\n");
}

function rawBlock(node: RootContent, ctx: Ctx): JSONContent {
  return { type: "rawBlock", attrs: { source: slice(node, ctx) } };
}

function rawInline(node: PhrasingContent, ctx: Ctx, marks: Mark[]): JSONContent {
  return withMarks({ type: "rawInline", attrs: { source: slice(node, ctx) } }, marks);
}

/* ───────────────────────── JSX 속성 ───────────────────────── */

interface AttrReadResult {
  ok: boolean;
  known: Record<string, string | number | boolean | null>;
  extra: ExtraAttr[] | null;
}

/**
 * JSX 속성 읽기. spec 은 우리가 아는 속성 이름 → 종류.
 * 아는 속성인데 모양이 이상하거나({...spread}) 하면 ok=false → 원문 블록으로 보관.
 */
function readAttrs(
  el: MdxJsxFlowElement | MdxJsxTextElement,
  spec: Record<string, "string" | "number" | "boolean">,
): AttrReadResult {
  const known: AttrReadResult["known"] = {};
  const extra: ExtraAttr[] = [];
  for (const a of el.attributes) {
    if (a.type !== "mdxJsxAttribute") return { ok: false, known, extra: null };
    const attr = a as MdxJsxAttribute;
    const kind = spec[attr.name];
    const v = attr.value;
    if (!kind) {
      if (v == null || typeof v === "string") extra.push({ name: attr.name, value: v ?? null });
      else extra.push({ name: attr.name, value: { expr: v.value } });
      continue;
    }
    if (attr.name in known) return { ok: false, known, extra: null };
    if (kind === "string") {
      if (typeof v !== "string") return { ok: false, known, extra: null };
      known[attr.name] = v;
    } else if (kind === "number") {
      if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) known[attr.name] = Number(v);
      else if (v && typeof v === "object" && /^\s*\d+(\.\d+)?\s*$/.test(v.value)) known[attr.name] = Number(v.value);
      else return { ok: false, known, extra: null };
    } else {
      if (v == null) known[attr.name] = true;
      else if (typeof v === "object" && /^\s*(true|false)\s*$/.test(v.value)) known[attr.name] = v.value.trim() === "true";
      else return { ok: false, known, extra: null };
    }
  }
  return { ok: true, known, extra: extra.length ? extra : null };
}

/* ───────────────────────── 블록 ───────────────────────── */

const BLOCK_COMPONENTS = new Set(["Callout", "Steps", "Step", "Figure", "CardGrid", "Card"]);

function isBlank(n: RootContent): boolean {
  return n.type === "text" && !(n as { value: string }).value.trim();
}

function blocks(nodes: RootContent[], ctx: Ctx): JSONContent[] {
  const out: JSONContent[] = [];
  for (const n of nodes) out.push(...block(n, ctx));
  return out;
}

/** 블록 내용이 비면 빈 문단 하나 (block+ 자리) */
function blockPlus(nodes: RootContent[], ctx: Ctx): JSONContent[] {
  const b = blocks(nodes, ctx);
  return b.length ? b : [{ type: "paragraph" }];
}

function block(n: RootContent, ctx: Ctx): JSONContent[] {
  switch (n.type) {
    case "paragraph":
      return [paragraph(n, ctx)];
    case "heading": {
      const content = inline(n.children, ctx, []);
      return [{ type: "heading", attrs: { level: n.depth }, ...(content.length ? { content } : {}) }];
    }
    case "thematicBreak":
      return [{ type: "horizontalRule" }];
    case "blockquote":
      return [{ type: "blockquote", content: blockPlus(n.children, ctx) }];
    case "list":
      return [list(n, ctx)];
    case "code": {
      const attrs = { language: n.lang ?? null, meta: n.meta ?? null };
      return [{ type: "codeBlock", attrs, ...(n.value ? { content: [{ type: "text", text: n.value }] } : {}) }];
    }
    case "table":
      return [table(n, ctx)];
    case "mdxJsxFlowElement":
      return [jsxBlock(n, ctx)];
    default:
      // mdxjsEsm(import/export), mdxFlowExpression, html, definition, footnoteDefinition …
      return [rawBlock(n, ctx)];
  }
}

function paragraph(p: Paragraph, ctx: Ctx): JSONContent {
  const kids = p.children.filter((c) => !(c.type === "text" && !c.value.trim()));
  if (kids.length === 1) {
    const only = kids[0];
    // 문단에 이미지 하나만 → 이미지 블록
    if (only.type === "image" && p.children.length === 1) {
      return { type: "image", attrs: { src: only.url, alt: only.alt ?? null, title: only.title ?? null } };
    }
    // [제목](주소 "youtube") → 유튜브 블록
    if (only.type === "link" && only.title === "youtube" && p.children.length === 1 && isPlainLink(only)) {
      return { type: "youtube", attrs: { url: only.url, title: plainText(only.children) } };
    }
    // 한 줄에 쓴 <Callout>…</Callout> 같은 것 → 블록으로
    if (only.type === "mdxJsxTextElement" && only.name && BLOCK_COMPONENTS.has(only.name) && p.children.length === 1) {
      return jsxBlock(only as unknown as MdxJsxFlowElement, ctx);
    }
  }
  const content = inline(p.children, ctx, []);
  return { type: "paragraph", ...(content.length ? { content } : {}) };
}

function isPlainLink(l: Link): boolean {
  return l.children.every((c) => c.type === "text");
}

function plainText(nodes: PhrasingContent[]): string {
  return nodes.map((c) => ("value" in c ? String(c.value) : "children" in c ? plainText(c.children as PhrasingContent[]) : "")).join("");
}

function list(n: List, ctx: Ctx): JSONContent {
  const spread = Boolean(n.spread) || n.children.some((i) => i.spread);
  const isTask = n.children.some((i) => i.checked != null);
  if (isTask && n.children.some((i) => i.checked == null)) {
    // 체크 상자가 섞인 목록 — 편집기 목록 하나로 표현이 안 되므로 원문 보관
    return rawBlock(n, ctx);
  }
  const items = n.children.map((i) => listItem(i, ctx, isTask));
  if (isTask) return { type: "taskList", attrs: { spread }, content: items };
  if (n.ordered) return { type: "orderedList", attrs: { start: n.start ?? 1, spread }, content: items };
  return { type: "bulletList", attrs: { spread }, content: items };
}

function listItem(i: ListItem, ctx: Ctx, isTask: boolean): JSONContent {
  const content = blocks(i.children, ctx);
  // 목록 항목은 문단으로 시작해야 한다
  if (!content.length || content[0].type !== "paragraph") content.unshift({ type: "paragraph" });
  return isTask
    ? { type: "taskItem", attrs: { checked: Boolean(i.checked) }, content }
    : { type: "listItem", content };
}

function table(n: Table, ctx: Ctx): JSONContent {
  const inner: Ctx = { ...ctx, inTable: true };
  const rows = n.children.map((row, ri) => ({
    type: "tableRow",
    content: row.children.map((cell) => {
      const content = inline(cell.children, inner, []);
      return {
        type: ri === 0 ? "tableHeader" : "tableCell",
        ...(content.length ? { content } : {}),
      };
    }),
  }));
  const align = n.align && n.align.some((a) => a) ? n.align.map((a) => a ?? null) : null;
  return { type: "table", attrs: { align }, content: rows };
}

/* ───────────────────────── JSX 블록 컴포넌트 ───────────────────────── */

function jsxChildren(el: MdxJsxFlowElement): RootContent[] {
  return (el.children as RootContent[]).filter((c) => !isBlank(c));
}

function jsxBlock(el: MdxJsxFlowElement, ctx: Ctx): JSONContent {
  const raw = () => rawBlock(el as unknown as RootContent, ctx);
  switch (el.name) {
    case "Callout": {
      const r = readAttrs(el, { type: "string", title: "string" });
      if (!r.ok) return raw();
      const type = r.known.type as string | undefined;
      if (type != null && !CALLOUT_TYPES.includes(type as CalloutType)) return raw();
      return {
        type: "callout",
        attrs: { type: type ?? null, title: (r.known.title as string | undefined) ?? null, extraAttrs: r.extra },
        content: blockPlus(flowKids(el), ctx),
      };
    }
    case "Steps": {
      const r = readAttrs(el, {});
      if (!r.ok) return raw();
      const kids = jsxChildren(el);
      if (!kids.length || !kids.every((k) => k.type === "mdxJsxFlowElement" && k.name === "Step")) return raw();
      const steps: JSONContent[] = [];
      for (const k of kids as MdxJsxFlowElement[]) {
        const s = readAttrs(k, { title: "string" });
        if (!s.ok) return raw();
        steps.push({
          type: "step",
          attrs: { title: (s.known.title as string | undefined) ?? "", extraAttrs: s.extra },
          content: blockPlus(flowKids(k), ctx),
        });
      }
      return { type: "steps", attrs: { extraAttrs: r.extra }, content: steps };
    }
    case "Figure": {
      const r = readAttrs(el, { src: "string", alt: "string", caption: "string", width: "number", height: "number", static: "boolean" });
      if (!r.ok || jsxChildren(el).length || typeof r.known.src !== "string") return raw();
      return {
        type: "figure",
        attrs: {
          src: r.known.src,
          alt: (r.known.alt as string | undefined) ?? "",
          caption: (r.known.caption as string | undefined) ?? null,
          width: (r.known.width as number | undefined) ?? null,
          height: (r.known.height as number | undefined) ?? null,
          static: Boolean(r.known.static),
          extraAttrs: r.extra,
        },
      };
    }
    case "CardGrid": {
      const r = readAttrs(el, {});
      if (!r.ok) return raw();
      const kids = jsxChildren(el);
      if (!kids.length || !kids.every((k) => k.type === "mdxJsxFlowElement" && k.name === "Card")) return raw();
      const cards: JSONContent[] = [];
      for (const k of kids as MdxJsxFlowElement[]) {
        const c = readAttrs(k, { href: "string", title: "string" });
        if (!c.ok) return raw();
        cards.push({
          type: "card",
          attrs: { href: (c.known.href as string | undefined) ?? null, title: (c.known.title as string | undefined) ?? "", extraAttrs: c.extra },
          content: blockPlus(flowKids(k), ctx),
        });
      }
      return { type: "cardGrid", attrs: { extraAttrs: r.extra }, content: cards };
    }
    default:
      return raw();
  }
}

/** JSX 자식 — 한 줄에 쓴 경우(텍스트 요소)엔 글자들을 문단 하나로 감싼다 */
function flowKids(el: MdxJsxFlowElement): RootContent[] {
  const kids = el.children as RootContent[];
  const phrasing = kids.length > 0 && kids.every((k) => isPhrasing(k));
  if (phrasing) {
    const p: Paragraph = { type: "paragraph", children: kids as PhrasingContent[] };
    return kids.every((k) => isBlank(k)) ? [] : [p];
  }
  return kids.filter((k) => !isBlank(k));
}

const PHRASING = new Set([
  "text", "emphasis", "strong", "delete", "inlineCode", "link", "image", "break",
  "mdxJsxTextElement", "mdxTextExpression", "footnoteReference", "linkReference", "imageReference", "html",
]);
function isPhrasing(n: RootContent): boolean {
  return PHRASING.has(n.type);
}

/* ───────────────────────── 글자(인라인) ───────────────────────── */

function withMarks(node: JSONContent, marks: Mark[]): JSONContent {
  return marks.length ? { ...node, marks: marks.map((m) => ({ ...m })) } : node;
}

function inline(nodes: PhrasingContent[], ctx: Ctx, marks: Mark[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const n of nodes) out.push(...inlineNode(n, ctx, marks));
  return mergeText(out);
}

function inlineNode(n: PhrasingContent, ctx: Ctx, marks: Mark[]): JSONContent[] {
  switch (n.type) {
    case "text": {
      // 문단 안 줄바꿈(soft break)은 화면에서 띄어쓰기와 같다 → 띄어쓰기로
      const text = n.value.replace(/[ \t]*\n[ \t]*/g, " ");
      return text ? [withMarks({ type: "text", text }, marks)] : [];
    }
    case "strong":
      return inline(n.children, ctx, addMark(marks, { type: "bold" }));
    case "emphasis":
      return inline(n.children, ctx, addMark(marks, { type: "italic" }));
    case "delete":
      return inline(n.children, ctx, addMark(marks, { type: "strike" }));
    case "inlineCode":
      return n.value ? [withMarks({ type: "text", text: n.value }, addMark(marks, { type: "code" }))] : [rawInline(n, ctx, marks)];
    case "link": {
      if (!n.children.length || marks.some((m) => m.type === "link")) return [rawInline(n, ctx, marks)];
      return inline(n.children, ctx, addMark(marks, { type: "link", attrs: { href: n.url, title: n.title ?? null } }));
    }
    case "break":
      return [withMarks({ type: "hardBreak" }, marks)];
    case "mdxJsxTextElement":
      return jsxInline(n, ctx, marks);
    default:
      // image(글 사이 이미지), mdxTextExpression, footnoteReference, linkReference, html …
      return [rawInline(n, ctx, marks)];
  }
}

function jsxInline(el: MdxJsxTextElement, ctx: Ctx, marks: Mark[]): JSONContent[] {
  const raw = () => [rawInline(el as unknown as PhrasingContent, ctx, marks)];
  const kids = el.children as PhrasingContent[];
  switch (el.name) {
    case "Kbd": {
      const r = readAttrs(el, {});
      if (!r.ok || r.extra || !kids.length || marks.some((m) => m.type === "kbd")) return raw();
      return inline(kids, ctx, addMark(marks, { type: "kbd" }));
    }
    case "Badge": {
      const r = readAttrs(el, { tone: "string" });
      if (!r.ok || r.extra || !kids.length || marks.some((m) => m.type === "badge")) return raw();
      const tone = (r.known.tone as BadgeTone | undefined) ?? null;
      if (tone && !["beam", "muted", "warn"].includes(tone)) return raw();
      return inline(kids, ctx, addMark(marks, { type: "badge", attrs: { tone } }));
    }
    case "u": {
      const r = readAttrs(el, {});
      if (!r.ok || r.extra || !kids.length) return raw();
      return inline(kids, ctx, addMark(marks, { type: "underline" }));
    }
    case "br": {
      const r = readAttrs(el, {});
      if (!r.ok || r.extra || kids.length) return raw();
      return [withMarks({ type: "hardBreak" }, marks)];
    }
    default:
      return raw();
  }
}

function addMark(marks: Mark[], m: Mark): Mark[] {
  return marks.some((x) => x.type === m.type) ? marks : [...marks, m];
}

function sameMarks(a?: Mark[], b?: Mark[]): boolean {
  const x = a ?? [];
  const y = b ?? [];
  if (x.length !== y.length) return false;
  return x.every((m) => y.some((n) => n.type === m.type && JSON.stringify(n.attrs ?? null) === JSON.stringify(m.attrs ?? null)));
}

/** 같은 표시를 가진 이웃 글자 조각을 하나로 */
function mergeText(nodes: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (prev && prev.type === "text" && n.type === "text" && sameMarks(prev.marks as Mark[], n.marks as Mark[])) {
      out[out.length - 1] = { ...prev, text: (prev.text ?? "") + (n.text ?? "") };
    } else out.push(n);
  }
  return out;
}
