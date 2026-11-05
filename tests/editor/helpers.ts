/**
 * 테스트 도우미 — mdast 를 '뜻이 같은지' 비교할 수 있게 다듬는다.
 * 위치 정보·글자 사이 공백·속성 순서·목록 간격 표기처럼 화면 결과가 같은 차이는 지운다.
 */
import { getSchema, type JSONContent } from "@tiptap/core";
import type { Root } from "mdast";
import { parseMarkdown } from "@/lib/editor/mdast";
import { splitFrontmatter } from "@/lib/editor/frontmatter";
import { wikiExtensions } from "@/lib/editor/schema";

type Any = Record<string, unknown> & { type?: string; children?: Any[] };

export function normalizedTree(mdxFile: string): Any {
  const { body } = splitFrontmatter(mdxFile);
  return norm(parseMarkdown(body) as unknown as Any) as Any;
}

function norm(node: Any): Any | Any[] | null {
  const n: Any = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "position" || k === "data" || k === "children") continue;
    n[k] = v === undefined ? null : v;
  }
  if (n.type === "mdxJsxTextElement" && n.name === "br") return { type: "break" };
  if (n.type === "text") n.value = String(n.value).replace(/\s+/g, " ");
  if (n.type === "list") {
    n.spread = Boolean(n.spread) || (node.children ?? []).some((i) => i.spread);
  }
  if (n.type === "listItem") delete n.spread;
  if (n.type === "table" && Array.isArray(n.align) && (n.align as unknown[]).every((a) => !a)) n.align = null;
  if (n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement") {
    const attrs = (n.attributes as Any[]).map((a) => ({
      name: a.name,
      value: a.value && typeof a.value === "object" ? { expr: String((a.value as Any).value).trim() } : a.value ?? null,
    }));
    attrs.sort((x, y) => String(x.name).localeCompare(String(y.name)));
    n.attributes = attrs;
  }
  if (node.children) {
    let kids = node.children.flatMap((c) => {
      const r = norm(c);
      return r == null ? [] : Array.isArray(r) ? r : [r];
    });
    // JSX 자식 사이 공백 글자, 이웃 text 합치기
    if (n.type === "mdxJsxFlowElement") kids = kids.filter((k) => !(k.type === "text" && !String(k.value).trim()));
    const merged: Any[] = [];
    for (const k of kids) {
      const prev = merged[merged.length - 1];
      if (prev && prev.type === "text" && k.type === "text") prev.value = String(prev.value) + String(k.value);
      else merged.push(k);
    }
    // 문단 끝·처음 공백은 화면에 안 보인다
    if (n.type === "paragraph" || n.type === "heading" || n.type === "tableCell") {
      const f = merged[0];
      if (f && f.type === "text") f.value = String(f.value).replace(/^ /, "");
      const l = merged[merged.length - 1];
      if (l && l.type === "text") l.value = String(l.value).replace(/ $/, "");
    }
    n.children = merged.filter((k) => !(k.type === "text" && k.value === ""));
  }
  return n;
}

/** 모든 글자(코드 포함)를 공백 정리해서 이어 붙인 것 */
export function allText(tree: Root | Any): string {
  const out: string[] = [];
  const walk = (n: Any) => {
    if (typeof n.value === "string") out.push(n.value);
    if (Array.isArray(n.attributes)) for (const a of n.attributes as Any[]) out.push(`${a.name}=${JSON.stringify(a.value)}`);
    if (typeof n.url === "string") out.push(n.url);
    for (const c of n.children ?? []) walk(c);
  };
  walk(tree as Any);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

const schema = getSchema(wikiExtensions());

/** 편집기 스키마로 검사(잘못된 구조면 throw)하고 표준 JSON 으로 */
export function checkDoc(doc: JSONContent): JSONContent {
  const node = schema.nodeFromJSON(doc);
  node.check();
  return node.toJSON();
}

export { schema };
