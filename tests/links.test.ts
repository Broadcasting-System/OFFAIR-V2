/** 주소 규칙 — 편집 주소·로그인 뒤 돌아갈 주소(열린 리다이렉트 막기) */
import assert from "node:assert/strict";
import { test } from "node:test";
import { docHref, editHref, loginHref, safeNext } from "@/lib/wiki/links";

test("편집 주소는 /write/<공간>/<문서…>, 읽기 주소는 공간마다", () => {
  assert.equal(editHref("guide", ["onair-time"]), "/write/guide/onair-time");
  assert.equal(editHref("members", ["회의", "2026-11"]), "/write/members/%ED%9A%8C%EC%9D%98/2026-11");
  assert.equal(docHref("guide", ["a", "b"]), "/docs/a/b");
  assert.equal(docHref("members", ["금요일"]), "/members/%EA%B8%88%EC%9A%94%EC%9D%BC");
});

test("safeNext: 사이트 안 경로만, 나머지는 /", () => {
  assert.equal(safeNext("/members/abc?x=1#h"), "/members/abc?x=1#h");
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil", "", null, undefined, "/a\nb"]) {
    assert.equal(safeNext(bad as string | null | undefined), "/", String(bad));
  }
  assert.equal(loginHref("/members/x"), "/login?next=%2Fmembers%2Fx");
  assert.equal(loginHref("https://evil.com"), "/login?next=%2F");
});
