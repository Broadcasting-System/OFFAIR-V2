import assert from "node:assert/strict";
import { describe, test } from "node:test";
import remarkGfm from "remark-gfm";
import { blockDiff, similarity, tokenize, wordDiff, type DiffChunk } from "@/lib/wiki/block-diff";

/** 조각이 MDX 로 컴파일되는지 (그릴 수 있는지) */
async function compiles(src: string): Promise<boolean> {
  try {
    // @mdx-js/mdx 는 ESM 전용이라 테스트(CJS)에서는 동적 import
    const { compile } = await import("@mdx-js/mdx");
    await compile(src, { remarkPlugins: [remarkGfm] });
    return true;
  } catch {
    return false;
  }
}

const kinds = (cs: DiffChunk[]) => cs.map((c) => c.kind);

describe("낱말 나누기·비교", () => {
  test("한글 낱말, 공백, 문장부호, 이스케이프를 따로 나눈다", () => {
    assert.deepEqual(tokenize("서버에 적용합니다."), ["서버에", " ", "적용합니다", "."]);
    assert.deepEqual(tokenize("a\\*b"), ["a", "\\*", "b"]);
    assert.deepEqual(tokenize("x&amp;y"), ["x", "&amp;", "y"]);
  });

  test("similarity 는 같은 낱말 비율", () => {
    assert.equal(similarity(["a", "b"], ["a", "b"]), 1);
    assert.equal(similarity(["a"], ["b"]), 0);
    assert.equal(similarity(["a", "b", "c", "d"], ["a", "b", "x", "y"]), 0.5);
  });

  test("wordDiff 는 바뀐 낱말만 del/add", () => {
    assert.deepEqual(wordDiff("등록하고 전송하기", "등록하고 적용하기"), [
      { type: "same", text: "등록하고 " },
      { type: "del", text: "전송하기" },
      { type: "add", text: "적용하기" },
    ]);
  });
});

describe("블록 diff", () => {
  test("같으면 한 조각", () => {
    const body = "## 제목\n\n문단 하나.\n\n- a\n- b\n";
    const cs = blockDiff(body, body);
    assert.deepEqual(kinds(cs), ["same"]);
    assert.equal(cs[0].source, body.trim());
  });

  test("문단 안 낱말 바뀜 → changed 에 del/ins", async () => {
    const o = "학교 종을 등록하고 서버에 전송합니다.\n\n## 화면 구성\n";
    const n = "학교 종을 등록하고 서버에 적용합니다.\n\n## 화면 구성\n";
    const cs = blockDiff(o, n);
    assert.deepEqual(kinds(cs), ["changed", "same"]);
    assert.equal(cs[0].source, "학교 종을 등록하고 서버에 <del>전송합니다</del><ins>적용합니다</ins>.");
    assert.ok(await compiles(cs[0].source));
  });

  test("통째로 더한 블록과 지운 블록", () => {
    const o = "첫 문단.\n\n지울 문단이에요 완전히 다른 말.\n\n끝 문단.\n";
    const n = "첫 문단.\n\n<Callout type=\"warn\">새 주의</Callout>\n\n끝 문단.\n";
    const cs = blockDiff(o, n);
    assert.deepEqual(kinds(cs), ["same", "removed", "added", "same"]);
    assert.equal(cs[1].source, "지울 문단이에요 완전히 다른 말.");
    assert.equal(cs[2].source, '<Callout type="warn">새 주의</Callout>');
  });

  test("제목은 # 를 지키고 낱말만 표시", () => {
    const cs = blockDiff("## 시보 추가 방법\n", "## 시보 추가하기 방법\n");
    assert.equal(cs[0].kind, "changed");
    assert.equal(cs[0].source, "## 시보 <del>추가</del><ins>추가하기</ins> 방법");
  });

  test("표는 줄끼리 맞춰 칸 안에서 비교하고, 더한 줄은 ins", async () => {
    const o = "| 영역 | 설명 |\n| --- | --- |\n| GROUP 탭 | 5개 그룹 |\n| 시보 추가·전송 | 서버로 전송하는 버튼 |\n";
    const n = "| 영역 | 설명 |\n| --- | --- |\n| GROUP 탭 | 5개 그룹 |\n| 시보 추가·적용 | 서버로 적용하는 버튼 |\n| 새 줄 | 더함 |\n";
    const cs = blockDiff(o, n);
    assert.deepEqual(kinds(cs), ["changed"]);
    const lines = cs[0].source.split("\n");
    assert.equal(lines[0], "| 영역 | 설명 |");
    assert.equal(lines[2], "| GROUP 탭 | 5개 그룹 |");
    assert.equal(lines[3], "| 시보 추가·<del>전송</del><ins>적용</ins> | 서버로 <del>전송하는</del><ins>적용하는</ins> 버튼 |");
    assert.equal(lines[4], "| <ins>새 줄</ins> | <ins>더함</ins> |");
    assert.ok(await compiles(cs[0].source));
  });

  test("표에서 같은 자리의 줄이 바뀌면 칸 안에서 지움/더함, 남는 새 줄은 ins", () => {
    const o = "| a | b |\n| - | - |\n| 시보 추가·전송 | 서버로 전송하는 버튼 |\n";
    const n = "| a | b |\n| - | - |\n| 적용하기 | 고친 시보를 보냄 |\n| P(특별) | 특별 시간표 |\n";
    const lines = blockDiff(o, n)[0].source.split("\n");
    assert.equal(lines[2], "| <del>시보 추가·전송</del><ins>적용하기</ins> | <del>서버로 전송하는 버튼</del><ins>고친 시보를 보냄</ins> |");
    assert.equal(lines[3], "| <ins>P(특별)</ins> | <ins>특별 시간표</ins> |");
  });

  test("표의 칸 수가 달라지면 지움+더함으로", () => {
    const o = "| a | b |\n| - | - |\n| 1 | 2 |\n";
    const n = "| a | b | c |\n| - | - | - |\n| 1 | 2 | 3 |\n";
    assert.deepEqual(kinds(blockDiff(o, n)), ["removed", "added"]);
  });

  test("목록은 항목끼리: 바뀐 항목은 낱말, 더한 항목은 ins", async () => {
    const o = "- 마이크를 켠다\n- 음량을 올린다\n";
    const n = "- 마이크를 켠다\n- 음량을 천천히 올린다\n- 끝나면 끈다\n";
    const cs = blockDiff(o, n);
    assert.deepEqual(kinds(cs), ["changed"]);
    assert.equal(cs[0].source, "- 마이크를 켠다\n- 음량을 <ins>천천히</ins> 올린다\n- &#8203;<ins>끝나면 끈다</ins>");
    assert.ok(await compiles(cs[0].source));
  });

  test("굵게·링크는 통째로 한 조각이라 문법이 깨지지 않는다", async () => {
    const o = "이건 **중요한 말** 이에요 [링크](/a).\n";
    const n = "이건 **아주 중요한 말** 이에요 [링크](/b).\n";
    const cs = blockDiff(o, n);
    assert.equal(cs[0].kind, "changed");
    assert.match(cs[0].source, /<del>\*\*중요한 말\*\*<\/del><ins>\*\*아주 중요한 말\*\*<\/ins>/);
    assert.ok(await compiles(cs[0].source));
  });

  test("JSX 콜아웃 안의 문단도 낱말 단위로", async () => {
    const o = '<Callout type="tip">\n  저장만으로는 안 울려요.\n\n  두 번째 문단.\n</Callout>\n';
    const n = '<Callout type="tip">\n  저장만으로는 절대 안 울려요.\n\n  두 번째 문단.\n</Callout>\n';
    const cs = blockDiff(o, n);
    assert.equal(cs[0].kind, "changed");
    assert.match(cs[0].source, /<ins>절대<\/ins>/);
    assert.match(cs[0].source, /^<Callout type="tip">/);
    assert.ok(await compiles(cs[0].source));
  });

  test("문단 전체가 바뀌어 태그로 시작해도 문단으로 남는다", async () => {
    const cs = blockDiff("전송하기 버튼 누름\n", "적용하기 버튼 누름\n");
    assert.equal(cs[0].kind, "changed");
    assert.ok(cs[0].source.startsWith("&#8203;<del>"));
    assert.ok(await compiles(cs[0].source));
  });

  test("코드 블록이 바뀌면 지움+더함", () => {
    const cs = blockDiff("```sh\nnpm i\n```\n", "```sh\nnpm ci\n```\n");
    assert.deepEqual(kinds(cs), ["removed", "added"]);
  });

  test("예전 버전이 MDX 로 안 읽혀도 멈추지 않는다", () => {
    const cs = blockDiff("깨진 <Callout 문서\n\n둘째\n", "고친 문서\n\n둘째\n");
    assert.ok(cs.length >= 2);
    assert.equal(cs[cs.length - 1].kind, "same");
  });
});
