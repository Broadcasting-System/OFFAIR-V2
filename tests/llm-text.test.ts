/** MDX → LLM 용 마크다운 (lib/wiki/llm-text.ts) — 컴포넌트마다 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mdxToLlmText } from "@/lib/wiki/llm-text";

const t = (body: string, section?: string) => mdxToLlmText(body, { section }).text;

describe("컴포넌트 → 글", () => {
  test("Callout: 종류 라벨·제목·여러 줄", () => {
    assert.equal(t('<Callout type="warn" title="조심">\n전원은 마지막에\n\n두 번째 문단\n</Callout>\n'), "> [주의] 조심: 전원은 마지막에\n>\n> 두 번째 문단\n");
    assert.equal(t('<Callout type="tip">짧은 팁</Callout>\n'), "> [팁] 짧은 팁\n");
    assert.equal(t('<Callout type="info">a</Callout>\n\n<Callout type="note">b</Callout>\n\n<Callout type="danger">c</Callout>\n'), "> [정보] a\n\n> [참고] b\n\n> [경고] c\n");
    assert.equal(t("<Callout>종류 없음</Callout>\n"), "> [참고] 종류 없음\n");
  });

  test("Steps/Step: 번호 목록, 제목은 굵게, 본문은 들여쓰기", () => {
    const src = '<Steps>\n<Step title="켜기">\n전원을 켭니다.\n</Step>\n<Step title="확인">\n- 불빛\n- 소리\n</Step>\n</Steps>\n';
    assert.equal(t(src), "1. **켜기**\n\n   전원을 켭니다.\n2. **확인**\n\n   - 불빛\n   - 소리\n");
  });

  test("Figure: 캡션 (대체 글)", () => {
    assert.equal(t('<Figure src="/a.webp" alt="믹서 사진" caption="① 페이더" />\n'), "[그림: ① 페이더 (믹서 사진)]\n");
    assert.equal(t('<Figure src="/a.webp" alt="믹서" />\n'), "[그림: 믹서]\n");
    assert.equal(t('<Figure src="/a.webp" />\n'), "[그림]\n");
  });

  test("CardGrid/Card: 제목 — 링크", () => {
    const src = '<CardGrid>\n<Card href="/docs/a" title="송출">\n방송 내보내기\n</Card>\n<Card href="/docs/b" title="음향" />\n</CardGrid>\n';
    assert.equal(t(src), "- 송출 — /docs/a · 방송 내보내기\n- 음향 — /docs/b\n");
  });

  test("Kbd → `키`, Badge → 글자, br → 줄바꿈", () => {
    assert.equal(t('<Kbd>⌘</Kbd> + <Kbd>S</Kbd> 저장 <Badge tone="warn">LIVE</Badge>\n'), "`⌘` + `S` 저장 LIVE\n");
  });

  test("YouTube 와 예전 [제목](주소 \"youtube\")", () => {
    assert.equal(t('<YouTube id="dQw4w9WgXcQ" start={30} title="사용법" />\n'), "[영상: 사용법 https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s]\n");
    assert.equal(t('[옛 영상](https://youtu.be/abc "youtube")\n'), "[영상: 옛 영상 https://youtu.be/abc]\n");
  });

  test("표·코드 블록은 그대로, 물결 하나는 글자", () => {
    assert.equal(t("| 가 | 나 |\n| --- | --- |\n| 1~4 | **굵게** |\n"), "| 가 | 나 |\n| - | - |\n| 1~4 | **굵게** |\n");
    assert.equal(t("```bash\nnpm start\n```\n"), "```bash\nnpm start\n```\n");
  });

  test("import·{식}·모르는 컴포넌트", () => {
    assert.equal(t('import X from "y"\n\n{1 + 1}\n\n<Unknown a="b">\n속 글\n</Unknown>\n'), "속 글\n");
  });

  test("한 줄로 쓴 블록 컴포넌트도", () => {
    assert.equal(t('<Callout type="tip" title="팁">한 줄</Callout>\n'), "> [팁] 팁: 한 줄\n");
  });

  test("깨진 MDX 는 그냥 마크다운으로", () => {
    assert.match(t("<Callout>닫지 않음\n\n그래도 글\n"), /그래도 글/);
  });
});

describe("소제목 고르기", () => {
  const src = "# 맨 위\n\n머리\n\n## A\n\na 글\n\n### A-1\n\n깊이\n\n## B\n\nb 글\n";
  test("그 소제목부터 같은·더 높은 단계 소제목 전까지", () => {
    assert.equal(t(src, "A"), "## A\n\na 글\n\n### A-1\n\n깊이\n");
    assert.equal(t(src, "a-1"), "### A-1\n\n깊이\n", "글자 크기 무시");
    assert.equal(t(src, "B"), "## B\n\nb 글\n");
  });
  test("없으면 found=false", () => {
    const r = mdxToLlmText(src, { section: "없는 것" });
    assert.equal(r.found, false);
    assert.deepEqual(r.headings.map((x) => x.text), ["맨 위", "A", "A-1", "B"]);
  });
});
