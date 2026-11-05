import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { StoreError } from "@/lib/store/errors";
import { joinInside, parseRelFile, parseSlug, slugify } from "@/lib/store/paths";
import { assertRev } from "@/lib/store/git";

const badPath = (fn: () => unknown) =>
  assert.throws(fn, (e: unknown) => e instanceof StoreError && (e.code === "bad_path" || e.code === "bad_request"));

test("정상 슬러그는 조각 배열로", () => {
  assert.deepEqual(parseSlug("intro"), ["intro"]);
  assert.deepEqual(parseSlug("audio/mixer"), ["audio", "mixer"]);
  assert.deepEqual(parseSlug(["audio", "믹서"]), ["audio", "믹서"]);
  assert.deepEqual(parseSlug("audio/mixer.mdx"), ["audio", "mixer"]);
});

test("상위 폴더·절대 경로·드라이브·백슬래시 거부", () => {
  for (const bad of [
    "../etc/passwd",
    "a/../../b",
    "./a",
    "/etc/passwd",
    "C:/Windows/win.ini",
    "c:foo",
    "a\\b",
    "..\\..\\x",
    "",
    "a//b",
    ["a", ".."],
    ["..", "x"],
    ["a/b"],
    ["a\\b"],
  ]) {
    badPath(() => parseSlug(bad as string));
  }
});

test("Windows 예약 이름·금지 문자·끝 점/공백·숨김 파일 거부", () => {
  for (const bad of ["con", "NUL", "com1", "lpt9.txt", "a:b", "a*b", 'a"b', "a<b", "a|b", "a?b", "end.", "end ", " start", ".hidden", "a\u0000b", "x\nme"]) {
    badPath(() => parseSlug(bad));
  }
});

test("확장자 확인: .mdx 만 허용하는 상대 파일 경로", () => {
  assert.deepEqual(parseRelFile("content/docs/a.mdx", [".mdx"]), ["content", "docs", "a.mdx"]);
  badPath(() => parseRelFile("content/docs/a.md", [".mdx"]));
  badPath(() => parseRelFile("content/docs/a", [".mdx"]));
  badPath(() => parseRelFile("content/docs/../../x.mdx", [".mdx"]));
  badPath(() => parseRelFile("/abs/x.mdx", [".mdx"]));
});

test("joinInside 는 루트 밖·심볼릭 링크 탈출을 막는다", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "offair-paths-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "offair-outside-"));
  try {
    assert.equal(joinInside(root, ["a", "b.mdx"]), path.join(root, "a", "b.mdx"));
    badPath(() => joinInside(root, ["..", "x.mdx"]));
    badPath(() => joinInside(root, []));
    let linked = false;
    try {
      fs.symlinkSync(outside, path.join(root, "link"), "dir");
      linked = true;
    } catch {
      /* Windows 에서 권한이 없으면 건너뜀 */
    }
    if (linked) badPath(() => joinInside(root, ["link", "x.mdx"]));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("리비전은 16진 해시만 (옵션 주입 방지)", () => {
  assert.equal(assertRev("ABCDEF1"), "abcdef1");
  for (const bad of ["--output=/tmp/x", "HEAD", "HEAD~1", "abc", "main", "a".repeat(65), "1234567 ; rm"]) {
    badPath(() => assertRev(bad));
  }
});

test("slugify 는 한글을 남기고 예약 이름을 피한다", () => {
  assert.equal(slugify("오디오 믹서 사용법!"), "오디오-믹서-사용법");
  assert.equal(slugify("  ../../etc  "), "etc");
  assert.equal(slugify("CON"), "con-doc");
  assert.equal(slugify("***"), "doc");
});
