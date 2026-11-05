import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cleanAnchor, locateAnchor, makeAnchor } from "@/lib/wiki/anchor";

const TEXT = "학교 종(시보)을 그룹·요일별 시간표로 등록하고 서버에 적용합니다. 화면 구성 GROUP 1~5 탭으로 시간표를 5개 그룹으로 관리하고, 요일은 월~금과 P(특별)이 있습니다.";

function select(text: string, quote: string, nth = 0) {
  let at = -1;
  for (let i = 0; i <= nth; i++) at = text.indexOf(quote, at + 1);
  return makeAnchor(text, at, at + quote.length)!;
}

describe("댓글 자리 만들기", () => {
  test("고른 글과 앞뒤 32자를 기억하고, 앞뒤 공백은 뺀다", () => {
    const at = TEXT.indexOf("그룹·요일별");
    const a = makeAnchor(TEXT, at - 1, at + "그룹·요일별 시간표".length, { block: 0, heading: null })!;
    assert.equal(a.quote, "그룹·요일별 시간표");
    assert.equal(a.prefix, "학교 종(시보)을 ");
    assert.ok(a.suffix.startsWith("로 등록하고"));
    assert.equal(a.block, 0);
  });

  test("빈 선택은 자리가 없다", () => {
    assert.equal(makeAnchor(TEXT, 5, 5), null);
    assert.equal(makeAnchor("가   나", 1, 4), null, "공백만 고르면 없음");
  });
});

describe("다시 찾기", () => {
  test("본문이 그대로면 같은 자리", () => {
    const a = select(TEXT, "P(특별)");
    const r = locateAnchor(TEXT, a)!;
    assert.equal(TEXT.slice(r.start, r.end), "P(특별)");
  });

  test("앞쪽 글이 바뀌어 위치가 밀려도 찾는다", () => {
    const a = select(TEXT, "P(특별)");
    const edited = "새 문단이 맨 앞에 들어왔어요. " + TEXT.replace("적용합니다", "보냅니다");
    const r = locateAnchor(edited, a)!;
    assert.equal(edited.slice(r.start, r.end), "P(특별)");
  });

  test("같은 글이 여러 번 나오면 앞뒤 글로 원래 자리를 고른다", () => {
    const a = select(TEXT, "시간표", 1); // 두 번째 "시간표"
    const r = locateAnchor(TEXT, a)!;
    assert.equal(r.start, TEXT.indexOf("시간표", TEXT.indexOf("시간표") + 1));
  });

  test("앞뒤 글이 같으면 원래 블록에 가까운 쪽", () => {
    const text = "가 나 다. 가 나 다.";
    const a = { quote: "나", prefix: "", suffix: "", block: 1 };
    const r = locateAnchor(text, a, [0, 7])!;
    assert.equal(r.start, text.lastIndexOf("나"));
  });

  test("공백·줄바꿈 차이는 무시한다", () => {
    const a = select(TEXT, "그룹·요일별 시간표");
    const edited = TEXT.replace("그룹·요일별 시간표", "그룹·요일별\n   시간표");
    const r = locateAnchor(edited, a)!;
    assert.equal(edited.slice(r.start, r.end), "그룹·요일별\n   시간표");
  });

  test("고른 글이 지워졌으면 null", () => {
    const a = select(TEXT, "P(특별)");
    assert.equal(locateAnchor(TEXT.replace("P(특별)", "토요일"), a), null);
  });
});

describe("저장 전 정리", () => {
  test("cleanAnchor 는 형식을 확인하고 크기를 자른다", () => {
    assert.equal(cleanAnchor(null), null);
    assert.equal(cleanAnchor({ quote: "   " }), null);
    const a = cleanAnchor({ quote: "x".repeat(900), prefix: "p".repeat(200), suffix: 3, block: -1, heading: "제목" })!;
    assert.equal(a.quote.length, 500);
    assert.equal(a.prefix.length, 64);
    assert.equal(a.suffix, "");
    assert.equal(a.block, null);
    assert.equal(a.heading, "제목");
  });
});
