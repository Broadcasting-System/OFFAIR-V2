/**
 * 문서 본문(MDX) → LLM 이 읽기 좋은 평범한 마크다운 (CUE 연동, `?format=text`).
 *
 * 읽기는 편집기와 같은 파서(lib/editor/mdast.ts — remark-mdx + GFM singleTilde:false)로 하고,
 * 우리 MDX 컴포넌트를 글로 바꾼다:
 *   <Callout type="warn" title="T">본문</Callout>  → > [주의] T: 본문   (줄마다 >)
 *   <Steps><Step title="A">…</Step></Steps>       → 1. **A** + 들여 쓴 본문
 *   <Figure caption alt />                       → [그림: caption (alt)]
 *   <CardGrid><Card title href>…</Card></CardGrid> → - 제목 — 링크
 *   <Kbd>⌘</Kbd> → `⌘`,  <Badge>새</Badge> → 새,  <YouTube id title/> · [제목](주소 "youtube") → [영상: 제목 주소]
 * 표·코드 블록은 GFM 그대로. import/export·{식}·HTML 은 버린다.
 */
import type { Heading, Paragraph, PhrasingContent, Root, RootContent } from "mdast";
import type { MdxJsxAttribute, MdxJsxFlowElement, MdxJsxTextElement } from "mdast-util-mdx-jsx";
import { toMarkdown, type Handle, type Info, type State } from "mdast-util-to-markdown";
import { gfmToMarkdown } from "mdast-util-gfm";
import { toString } from "mdast-util-to-string";
import { parseMarkdown } from "@/lib/editor/mdast";
import { needsTildeEscape } from "@/lib/editor/doc-to-mdx";

const CALLOUT_LABEL: Record<string, string> = {
  warn: "주의",
  info: "정보",
  tip: "팁",
  note: "참고",
  danger: "경고",
};

function attr(el: MdxJsxFlowElement | MdxJsxTextElement, name: string): string | null {
  for (const a of el.attributes) {
    if (a.type !== "mdxJsxAttribute") continue;
    const at = a as MdxJsxAttribute;
    if (at.name !== name) continue;
    if (at.value == null) return "";
    if (typeof at.value === "string") return at.value;
    return String(at.value.value ?? "").trim().replace(/^["'`](.*)["'`]$/, "$1");
  }
  return null;
}

/** 겉으로 그대로 내보내는 글 (mdast 의 html 노드는 to-markdown 이 글자 그대로 쓴다) */
const raw = (value: string): RootContent => ({ type: "html", value });

function youtubeUrl(id: string, start?: string | null): string {
  const t = start && /^\d+$/.test(start) && start !== "0" ? `&t=${start}s` : "";
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}${t}`;
}

function indent(text: string, n: number): string {
  const pad = " ".repeat(n);
  return text
    .split("\n")
    .map((l) => (l ? pad + l : l))
    .join("\n");
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/* ───────────── 글 단위(인라인) ───────────── */

function inline(nodes: PhrasingContent[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  for (const n of nodes) {
    if (n.type === "mdxJsxTextElement") {
      const el = n as MdxJsxTextElement;
      const kids = inline(el.children as PhrasingContent[]);
      if (el.name === "Kbd") out.push({ type: "inlineCode", value: toString({ type: "paragraph", children: kids }) });
      else if (el.name === "br") out.push({ type: "break" });
      else out.push(...kids);
      continue;
    }
    if (n.type === "mdxTextExpression" || n.type === "html") continue;
    if ("children" in n && Array.isArray(n.children)) {
      out.push({ ...n, children: inline(n.children as PhrasingContent[]) } as PhrasingContent);
      continue;
    }
    out.push(n);
  }
  return out;
}

/* ───────────── 블록 ───────────── */

/** 물결 하나("1~4")는 이스케이프하지 않는다 (편집기 직렬화와 같은 규칙) */
const textHandler: Handle = (node, _parent, state: State, info: Info) => {
  const value = (node as { value: string }).value;
  const saved = state.unsafe;
  if (!needsTildeEscape(value)) state.unsafe = saved.filter((p) => p.character !== "~");
  try {
    return state.safe(value, info);
  } finally {
    state.unsafe = saved;
  }
};

function render(nodes: RootContent[]): string {
  const root: Root = { type: "root", children: blocks(nodes) };
  return toMarkdown(root, {
    extensions: [gfmToMarkdown({ tablePipeAlign: false })],
    bullet: "-",
    emphasis: "*",
    strong: "*",
    fences: true,
    listItemIndent: "one",
    resourceLink: true,
    handlers: {
      // html 노드 = 우리가 만든 글 그대로
      html: (node) => (node as { value: string }).value,
      text: textHandler,
    },
  }).trim();
}

function blocks(nodes: RootContent[]): RootContent[] {
  const out: RootContent[] = [];
  for (const n of nodes) {
    const b = block(n);
    if (b) out.push(b);
  }
  return out;
}

function block(n: RootContent): RootContent | null {
  switch (n.type) {
    case "mdxjsEsm":
    case "mdxFlowExpression":
    case "html":
    case "yaml":
    case "definition":
      return null;
    case "mdxJsxFlowElement":
      return jsx(n as MdxJsxFlowElement);
    case "paragraph":
      return paragraph(n);
    case "heading":
      return { ...n, children: inline(n.children) };
    case "blockquote":
      return { ...n, children: blocks(n.children) as typeof n.children };
    case "list":
      return {
        ...n,
        children: n.children.map((li) => ({ ...li, children: blocks(li.children) as typeof li.children })),
      };
    case "table":
      return {
        ...n,
        children: n.children.map((row) => ({
          ...row,
          children: row.children.map((cell) => ({ ...cell, children: inline(cell.children) })),
        })),
      };
    default:
      return n;
  }
}

function paragraph(p: Paragraph): RootContent | null {
  const kids = p.children.filter((c) => !(c.type === "text" && !c.value.trim()));
  // [제목](주소 "youtube") — 예전 영상 링크
  if (kids.length === 1 && kids[0].type === "link" && kids[0].title === "youtube") {
    const l = kids[0];
    return raw(`[영상: ${oneLine(toString(l)) || "유튜브 영상"} ${l.url}]`);
  }
  // 한 줄에 쓴 블록 컴포넌트 (<Callout>…</Callout>, <Figure … />)
  if (kids.length === 1 && kids[0].type === "mdxJsxTextElement" && /^(Callout|Steps|Figure|CardGrid|YouTube)$/.test(kids[0].name ?? "")) {
    return jsx(kids[0] as unknown as MdxJsxFlowElement);
  }
  const children = inline(p.children);
  if (!children.length) return null;
  return { ...p, children };
}

function jsx(el: MdxJsxFlowElement): RootContent | null {
  const kids = (el.children ?? []) as RootContent[];
  switch (el.name) {
    case "Callout": {
      const label = CALLOUT_LABEL[attr(el, "type") ?? "note"] ?? "참고";
      const title = attr(el, "title");
      const body = render(kids);
      const lines = body ? body.split("\n") : [""];
      const head = `[${label}]${title ? ` ${title}:` : ""}`;
      lines[0] = lines[0] ? `${head} ${lines[0]}` : head;
      return raw(lines.map((l) => (l ? `> ${l}` : ">")).join("\n"));
    }
    case "Steps": {
      const steps = kids.filter((k) => k.type === "mdxJsxFlowElement" && (k as MdxJsxFlowElement).name === "Step") as MdxJsxFlowElement[];
      const out = steps.map((s, i) => {
        const marker = `${i + 1}. `;
        const title = attr(s, "title");
        const body = render((s.children ?? []) as RootContent[]);
        const first = title ? `**${title}**` : "";
        const text = [first, body].filter(Boolean).join("\n\n");
        return marker + indent(text, marker.length).slice(marker.length);
      });
      return out.length ? raw(out.join("\n")) : null;
    }
    case "Step":
      return raw(render(kids));
    case "Figure": {
      const caption = oneLine(attr(el, "caption") ?? "");
      const alt = oneLine(attr(el, "alt") ?? "");
      const inner = caption && alt && alt !== caption ? `${caption} (${alt})` : caption || alt;
      return raw(inner ? `[그림: ${inner}]` : "[그림]");
    }
    case "CardGrid": {
      const cards = kids.filter((k) => k.type === "mdxJsxFlowElement" && (k as MdxJsxFlowElement).name === "Card") as MdxJsxFlowElement[];
      const lines = cards.map((c) => {
        const title = oneLine(attr(c, "title") ?? "") || "카드";
        const href = attr(c, "href");
        const body = oneLine(toString({ type: "root", children: (c.children ?? []) as RootContent[] } as Root));
        return `- ${title}${href ? ` — ${href}` : ""}${body ? ` · ${body}` : ""}`;
      });
      return lines.length ? raw(lines.join("\n")) : null;
    }
    case "YouTube": {
      const id = attr(el, "id");
      if (!id) return null;
      const title = oneLine(attr(el, "title") ?? "") || "유튜브 영상";
      return raw(`[영상: ${title} ${youtubeUrl(id, attr(el, "start"))}]`);
    }
    default: {
      // 모르는 컴포넌트 — 속 글만
      const inner = render(kids);
      return inner ? raw(inner) : null;
    }
  }
}

/* ───────────── 소제목 고르기 ───────────── */

/** 본문 최상위 소제목들 (글자) */
export function headingsOf(root: Root): { depth: number; text: string }[] {
  return root.children.filter((n): n is Heading => n.type === "heading").map((h) => ({ depth: h.depth, text: oneLine(toString(h)) }));
}

/** 그 소제목과 그 아래(같거나 더 높은 단계 소제목 전까지). 글자가 같으면 먼저, 없으면 들어 있는 것 */
function sectionOf(root: Root, section: string): RootContent[] | null {
  const want = oneLine(section).toLowerCase();
  const nodes = root.children;
  const heads = nodes
    .map((n, i) => ({ n, i }))
    .filter((x): x is { n: Heading; i: number } => x.n.type === "heading");
  const hit =
    heads.find((h) => oneLine(toString(h.n)).toLowerCase() === want) ??
    heads.find((h) => oneLine(toString(h.n)).toLowerCase().includes(want));
  if (!hit) return null;
  let end = nodes.length;
  for (let j = hit.i + 1; j < nodes.length; j++) {
    const n = nodes[j];
    if (n.type === "heading" && n.depth <= hit.n.depth) {
      end = j;
      break;
    }
  }
  return nodes.slice(hit.i, end);
}

export interface LlmText {
  text: string;
  /** section 을 달라고 했는데 못 찾았으면 false */
  found: boolean;
  headings: { depth: number; text: string }[];
}

/** body = 머리말을 뺀 MDX 본문 */
export function mdxToLlmText(body: string, opts: { section?: string | null } = {}): LlmText {
  let root: Root;
  try {
    root = parseMarkdown(body);
  } catch {
    // MDX 로 못 읽으면(깨진 JSX 등) 그냥 마크다운으로
    root = parseMarkdown(body, { mdx: false });
  }
  const headings = headingsOf(root);
  let nodes: RootContent[] = root.children;
  if (opts.section) {
    const sec = sectionOf(root, opts.section);
    if (!sec) return { text: "", found: false, headings };
    nodes = sec;
  }
  return { text: render(nodes) + "\n", found: true, headings };
}

