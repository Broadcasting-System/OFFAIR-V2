import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  highlight,
  isRecentDoc,
  isString,
  pushRecentDoc,
  pushRecentQuery,
  queryTokens,
  readList,
  trimSnippet,
} from "@/lib/wiki/search-text";

const marked = (segs: { text: string; mark: boolean }[]) => segs.filter((s) => s.mark).map((s) => s.text);

describe("검색어·형광펜", () => {
  test("queryTokens 는 소문자·중복 제거·긴 말 먼저", () => {
    assert.deepEqual(queryTokens("  OBS  장비 obs 음원 "), ["obs", "장비", "음원"]);
    assert.deepEqual(queryTokens(""), []);
  });

  test("여러 곳을 칠하고, 대소문자는 무시한다", () => {
    const segs = highlight("OBS 에서 obs 설정", "obs");
    assert.deepEqual(marked(segs), ["OBS", "obs"]);
    assert.equal(segs.map((s) => s.text).join(""), "OBS 에서 obs 설정");
  });

  test("붙어 나온 낱말은 한 덩어리로 (시안: 「장비 음원」)", () => {
    const segs = highlight("장비 그룹과 장비 음원 번호", "장비 음원");
    assert.deepEqual(marked(segs), ["장비", "장비 음원"]);
  });

  test("겹치는 낱말은 합친다", () => {
    assert.deepEqual(marked(highlight("타이머프로토콜", "타이머 머프로")), ["타이머프로"]);
  });

  test("일치가 없거나 검색어가 비면 칠하지 않는다", () => {
    assert.deepEqual(highlight("본문", "없음"), [{ text: "본문", mark: false }]);
    assert.deepEqual(highlight("본문", ""), [{ text: "본문", mark: false }]);
    assert.deepEqual(highlight("", "a"), []);
  });

  test("trimSnippet 은 첫 일치 근처로 자르고 … 를 붙인다", () => {
    const long = "가".repeat(200) + " 장비 음원 " + "나".repeat(200);
    const s = trimSnippet(long, "음원", 60);
    assert.ok(s.startsWith("…") && s.endsWith("…"));
    assert.ok(s.includes("음원"));
    assert.equal(trimSnippet("짧은 글", "글"), "짧은 글");
  });
});

describe("최근 목록", () => {
  test("최근 본 문서: 맨 앞에, 같은 주소는 한 번, 개수 제한", () => {
    let list = [] as ReturnType<typeof pushRecentDoc>;
    for (const n of ["a", "b", "c", "a"]) list = pushRecentDoc(list, { space: "guide", url: `/docs/${n}`, title: n }, 3);
    assert.deepEqual(list.map((d) => d.title), ["a", "c", "b"]);
  });

  test("최근 찾은 말: 빈 말은 넣지 않는다", () => {
    assert.deepEqual(pushRecentQuery(["x"], "  "), ["x"]);
    assert.deepEqual(pushRecentQuery(["x", "y"], "y"), ["y", "x"]);
  });

  test("readList 는 깨진 저장값을 버린다", () => {
    assert.deepEqual(readList("{oops", isString), []);
    assert.deepEqual(readList('["a", 1, "b"]', isString), ["a", "b"]);
    assert.equal(readList('[{"url":"/docs/a","title":"A","space":"guide"},{"url":1}]', isRecentDoc).length, 1);
  });
});
