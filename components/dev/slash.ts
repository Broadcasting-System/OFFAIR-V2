/**
 * Slash-menu data + helpers for the MDX editor.
 * `$|` in a body marks where the caret should land after insertion.
 */

export interface Snippet {
  label: string;
  group: "마크다운" | "컴포넌트";
  hint: string;
  keywords: string;
  body: string;
}

export const SNIPPETS: Snippet[] = [
  // ── 마크다운 ──
  { label: "제목 H2", group: "마크다운", hint: "## ", keywords: "h2 heading 제목 title", body: "## $|" },
  { label: "제목 H3", group: "마크다운", hint: "### ", keywords: "h3 heading 제목 title", body: "### $|" },
  { label: "글머리 목록", group: "마크다운", hint: "- ", keywords: "list ul 목록 bullet", body: "- $|" },
  { label: "번호 목록", group: "마크다운", hint: "1. ", keywords: "list ol 번호 ordered", body: "1. $|" },
  { label: "인용", group: "마크다운", hint: "> ", keywords: "quote blockquote 인용", body: "> $|" },
  { label: "굵게", group: "마크다운", hint: "**bold**", keywords: "bold strong 굵게", body: "**$|**" },
  { label: "링크", group: "마크다운", hint: "[text](url)", keywords: "link 링크 a", body: "[$|](https://)" },
  { label: "구분선", group: "마크다운", hint: "---", keywords: "hr divider 구분선 rule", body: "\n---\n\n$|" },
  {
    label: "표",
    group: "마크다운",
    hint: "table",
    keywords: "table 표 grid",
    body: "| 항목 | 값 |\n| --- | --- |\n| $| |  |\n",
  },
  {
    label: "코드 블록",
    group: "마크다운",
    hint: "``` code",
    keywords: "code 코드 fence pre",
    body: "```ts\n$|\n```",
  },

  // ── 컴포넌트 ──
  {
    label: "Callout · 팁",
    group: "컴포넌트",
    hint: "tip",
    keywords: "callout tip 팁 강조 note",
    body: '<Callout type="tip">\n$|\n</Callout>',
  },
  {
    label: "Callout · 정보",
    group: "컴포넌트",
    hint: "info",
    keywords: "callout info 정보",
    body: '<Callout type="info">\n$|\n</Callout>',
  },
  {
    label: "Callout · 주의",
    group: "컴포넌트",
    hint: "warn",
    keywords: "callout warn 주의 경고",
    body: '<Callout type="warn">\n$|\n</Callout>',
  },
  {
    label: "Callout · 경고",
    group: "컴포넌트",
    hint: "danger",
    keywords: "callout danger 경고 위험",
    body: '<Callout type="danger">\n$|\n</Callout>',
  },
  {
    label: "Steps · 절차",
    group: "컴포넌트",
    hint: "steps",
    keywords: "steps step 절차 단계 순서",
    body: '<Steps>\n  <Step title="$|">\n    \n  </Step>\n  <Step title="">\n    \n  </Step>\n</Steps>',
  },
  {
    label: "Figure · 이미지",
    group: "컴포넌트",
    hint: "image",
    keywords: "figure image 이미지 사진 그림",
    body: '<Figure src="/$|" alt="" caption="" width={1280} height={720} />',
  },
  {
    label: "CardGrid · 링크 카드",
    group: "컴포넌트",
    hint: "cards",
    keywords: "card cardgrid 카드 링크 grid",
    body: '<CardGrid>\n  <Card href="$|" title="">\n    \n  </Card>\n</CardGrid>',
  },
  {
    label: "Kbd · 단축키",
    group: "컴포넌트",
    hint: "kbd",
    keywords: "kbd key 단축키 키",
    body: "<Kbd>$|</Kbd>",
  },
  {
    label: "Badge · 배지",
    group: "컴포넌트",
    hint: "badge",
    keywords: "badge 배지 태그 tag",
    body: "<Badge>$|</Badge>",
  },
];

/** Detect an active `/query` immediately before the caret. */
export function detectSlash(
  value: string,
  caret: number
): { start: number; query: string } | null {
  let start = -1;
  for (let i = caret - 1; i >= 0; i--) {
    const c = value[i];
    if (c === "/") {
      start = i;
      break;
    }
    if (c === " " || c === "\n" || c === "\t") break;
  }
  if (start === -1) return null;
  const before = start > 0 ? value[start - 1] : "\n";
  if (before !== " " && before !== "\n" && before !== "\t") return null;
  const query = value.slice(start + 1, caret);
  if (/\s/.test(query)) return null;
  return { start, query };
}

export function filterSnippets(query: string): Snippet[] {
  const q = query.trim().toLowerCase();
  if (!q) return SNIPPETS;
  return SNIPPETS.filter(
    (s) =>
      s.label.toLowerCase().includes(q) ||
      s.keywords.toLowerCase().includes(q) ||
      s.hint.toLowerCase().includes(q)
  );
}

const MIRROR_PROPS = [
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "whiteSpace",
  "wordWrap",
] as const;

/** Pixel coordinates of a caret position inside a textarea (mirror technique). */
export function getCaretCoordinates(
  el: HTMLTextAreaElement,
  position: number
): { top: number; left: number; height: number } {
  const div = document.createElement("div");
  const style = div.style;
  const computed = window.getComputedStyle(el);
  style.position = "absolute";
  style.visibility = "hidden";
  style.whiteSpace = "pre-wrap";
  style.wordWrap = "break-word";
  for (const prop of MIRROR_PROPS) {
    style[prop] = computed[prop];
  }
  div.textContent = el.value.substring(0, position);
  const span = document.createElement("span");
  span.textContent = el.value.substring(position) || ".";
  div.appendChild(span);
  document.body.appendChild(div);
  const top = span.offsetTop + parseInt(computed.borderTopWidth, 10);
  const left = span.offsetLeft + parseInt(computed.borderLeftWidth, 10);
  const height = parseInt(computed.lineHeight, 10) || 18;
  document.body.removeChild(div);
  return { top, left, height };
}
