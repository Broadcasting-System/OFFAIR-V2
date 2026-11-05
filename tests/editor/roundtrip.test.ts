/**
 * tests/fixtures/content/ 아래 모든 MDX(실제 가이드 문서를 옮겨 둔 사본)를 편집기 문서로 바꿨다가
 * 다시 MDX 로 써 본다. content/ 는 배포 전에 비워질 수 있어서 테스트는 사본만 본다.
 *  (a) 한 번 정리된 뒤에는 몇 번을 돌려도 같은 글자(멱등)
 *  (b) 글자·속성·구조가 사라지지 않음 (정규화한 mdast 가 같음)
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mdxToDoc } from "@/lib/editor/mdx-to-doc";
import { docToMdx } from "@/lib/editor/doc-to-mdx";
import { splitFrontmatter, parseFrontmatter } from "@/lib/editor/frontmatter";
import { allText, checkDoc, normalizedTree } from "./helpers";

const ROOT = path.resolve(__dirname, "../fixtures/content");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith(".mdx") ? [full] : [];
  });
}

const files = walk(ROOT);

function roundTrip(src: string): string {
  const parsed = mdxToDoc(src);
  // 편집기 스키마에 맞는 문서인지 + 스키마가 표준화한 JSON 으로
  const doc = checkDoc(parsed.doc);
  return docToMdx({ meta: parsed.meta, doc });
}

describe("fixtures/content 왕복 변환", () => {
  it("문서가 하나 이상 있다", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    describe(rel, () => {
      const src = fs.readFileSync(file, "utf8");
      const once = roundTrip(src);

      it("한 번 정리 후 멱등", () => {
        expect(roundTrip(once)).toBe(once);
      });

      it("머리말이 그대로", () => {
        const a = parseFrontmatter(splitFrontmatter(src).yaml);
        const b = parseFrontmatter(splitFrontmatter(once).yaml);
        expect(b).toEqual(a);
      });

      it("글자·속성·구조가 사라지지 않음", () => {
        const before = normalizedTree(src);
        const after = normalizedTree(once);
        expect(allText(after)).toBe(allText(before));
        expect(after).toEqual(before);
      });

      it("원문 블록 없이 모두 편집기 노드로 옮겨짐", () => {
        const json = JSON.stringify(mdxToDoc(src).doc);
        expect(json.includes('"rawBlock"') || json.includes('"rawInline"')).toBe(false);
      });
    });
  }
});
