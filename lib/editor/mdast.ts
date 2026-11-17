/**
 * MDX ↔ mdast 처리기. 사이트 렌더러(lib/mdx.tsx: @mdx-js/mdx + remark-gfm, 설정은 lib/gfm.ts)와
 * 같은 문법으로 읽어야 편집기에서 본 것과 게시된 화면이 어긋나지 않는다.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { GFM_OPTIONS, remarkGfm } from "@/lib/gfm";
import type { Root } from "mdast";
import type {} from "mdast-util-mdx";

/** MDX 본문(머리말 뺀 것)을 mdast 로. `mdx: false` 면 그냥 마크다운(붙여넣기용). */
export function parseMarkdown(body: string, opts: { mdx?: boolean } = {}): Root {
  const mdx = opts.mdx ?? true;
  const proc = mdx
    ? unified().use(remarkParse).use(remarkMdx).use(remarkGfm, GFM_OPTIONS)
    : unified().use(remarkParse).use(remarkGfm, GFM_OPTIONS);
  return proc.parse(body) as Root;
}
