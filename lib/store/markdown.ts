import GithubSlugger from "github-slugger";

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

/** h2/h3 제목을 뽑는다. id 는 rehype-slug 가 붙이는 것과 같다. */
export function extractToc(body: string): TocItem[] {
  const slugger = new GithubSlugger();
  const lines = body.split("\n");
  const items: TocItem[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.*)$/.exec(line);
    if (!m) continue;
    const text = m[2].replace(/[*_`]/g, "").trim();
    items.push({
      id: slugger.slug(text),
      text,
      level: m[1].length as 2 | 3,
    });
  }
  return items;
}

/**
 * MDX 본문 → 검색용 평문. 완벽한 파서가 아니라 검색에 충분한 정도:
 * import/export 줄, JSX 태그, 주석, 마크다운 기호를 걷어 내고 글자만 남긴다.
 * 코드 블록 안의 글자는 남긴다 (명령어 검색용).
 */
export function mdxToPlainText(body: string, maxLength = 20_000): string {
  const out: string[] = [];
  let inFence = false;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (/^\s*(import|export)\s/.test(line)) continue;
    out.push(line);
  }
  let text = out.join("\n");
  text = text
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    // JSX 속성 중 사람이 읽는 글(title/alt/caption)은 남긴다
    .replace(/\b(?:title|alt|caption)=["']([^"']*)["']/g, " $1 ")
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*\|?[\s:-]*\|[\s|:-]*$/gm, " ")
    // 취소선 ~~ 만 지운다 — "1~5" 의 물결 하나는 글자 (lib/gfm.ts singleTilde: false)
    .replace(/~~/g, " ")
    .replace(/[|*_`]/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}
