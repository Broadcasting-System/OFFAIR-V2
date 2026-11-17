/**
 * 사이트 렌더러(lib/mdx.tsx)와 같은 GFM 설정(lib/gfm.ts)으로 그렸을 때
 * 물결 하나는 글자, 두 개만 취소선인지.
 */
import { describe, expect, it } from "vitest";
import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { remarkGfmPlugin } from "@/lib/gfm";

async function html(src: string): Promise<string> {
  const { default: Content } = await evaluate(src, { ...runtime, remarkPlugins: [remarkGfmPlugin] });
  return renderToStaticMarkup(createElement(Content));
}

describe("사이트 렌더러 물결", () => {
  it("1~4 는 취소선이 아니다", async () => {
    const out = await html("채널 1~4 와 3~5초\n");
    expect(out).not.toContain("<del>");
    expect(out).toContain("1~4");
  });
  it("~~두 개~~ 는 취소선", async () => {
    expect(await html("~~지움~~\n")).toContain("<del>지움</del>");
  });
});
