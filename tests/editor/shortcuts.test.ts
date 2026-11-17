// @vitest-environment happy-dom
/**
 * 마크다운 단축 입력(#, ##, -, 1., >, ```, ---, [ ], **굵게**)과 단축키,
 * '지금 블록 다음에 넣기' 규칙을 실제 편집기(노드 뷰 없이)로 확인한다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { wikiExtensions } from "@/lib/editor/schema";
import { docToBody } from "@/lib/editor/doc-to-mdx";
import { bodyToDoc } from "@/lib/editor/mdx-to-doc";
import { insertBlocks, blocksFor } from "@/components/editor/insert";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function make(body = "") {
  editor = new Editor({ element: document.createElement("div"), extensions: wikiExtensions(), content: bodyToDoc(body) });
  editor.commands.focus("end");
  return editor;
}

/** 브라우저가 글자를 칠 때처럼: handleTextInput(입력 규칙)이 안 받으면 그냥 넣는다 */
function typeChars(e: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = e.state.selection;
    const handled = e.view.someProp("handleTextInput", (f) => f(e.view, from, to, ch, () => e.state.tr.insertText(ch, from, to)));
    if (!handled) e.view.dispatch(e.state.tr.insertText(ch, from, to));
  }
}

/** 빈 줄에서 타이핑하고 결과 MDX */
function typeIn(...chunks: string[]) {
  const e = make();
  for (const c of chunks) typeChars(e, c);
  return docToBody(e.getJSON());
}

describe("마크다운 단축 입력", () => {
  it("# · ## · ### → 제목", () => {
    expect(typeIn("# ", "큰 제목")).toBe("# 큰 제목\n");
    expect(typeIn("## ", "중간")).toBe("## 중간\n");
    expect(typeIn("### ", "작은")).toBe("### 작은\n");
  });
  it("- → 글머리, 1. → 번호, [ ] → 할 일", () => {
    expect(typeIn("- ", "항목")).toBe("- 항목\n");
    expect(typeIn("1. ", "첫째")).toBe("1. 첫째\n");
    expect(typeIn("[ ] ", "할 일")).toBe("- [ ] 할 일\n");
  });
  it("> → 인용", () => expect(typeIn("> ", "인용")).toBe("> 인용\n"));
  it("``` → 코드 블록", () => expect(typeIn("```js ", "a()")).toBe("```js\na()\n```\n"));
  it("--- → 구분선", () => {
    const e = make();
    typeChars(e, "---");
    expect(e.getJSON().content!.map((n) => n.type)).toContain("horizontalRule");
  });
  it("**굵게** · *기울임* · `코드` · ~~취소~~", () => {
    expect(typeIn("**굵게**", " 끝")).toBe("**굵게** 끝\n");
    expect(typeIn("`코드`", " 끝")).toBe("`코드` 끝\n");
    expect(typeIn("~~취소~~", " 끝")).toBe("~~취소~~ 끝\n");
  });
});

function key(e: Editor, k: string, opts: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean; code?: number }) {
  const ev = new KeyboardEvent("keydown", {
    key: k,
    keyCode: opts.code,
    metaKey: opts.meta,
    ctrlKey: opts.ctrl,
    altKey: opts.alt,
    shiftKey: opts.shift,
    bubbles: true,
    cancelable: true,
  });
  let handled = false;
  e.view.someProp("handleKeyDown", (f) => {
    if (f(e.view, ev)) handled = true;
    return handled;
  });
  return handled;
}

describe("단축키", () => {
  // happy-dom 은 mac 이 아니므로 Mod = Ctrl
  it("Ctrl+Alt+2 → 중간 제목, Ctrl+Alt+0 → 본문", () => {
    const e = make("글");
    key(e, "2", { ctrl: true, alt: true, code: 50 });
    expect(docToBody(e.getJSON())).toBe("## 글\n");
    key(e, "0", { ctrl: true, alt: true, code: 48 });
    expect(docToBody(e.getJSON())).toBe("글\n");
  });
  it("Ctrl+Shift+8 → 글머리, Ctrl+Shift+7 → 번호", () => {
    const e = make("글");
    key(e, "8", { ctrl: true, shift: true, code: 56 });
    expect(docToBody(e.getJSON())).toBe("- 글\n");
    const e2 = make("글");
    key(e2, "7", { ctrl: true, shift: true, code: 55 });
    expect(docToBody(e2.getJSON())).toBe("1. 글\n");
  });
  it("Ctrl+B 굵게 · Ctrl+E 코드 · Ctrl+Shift+S 취소선", () => {
    const e = make("글자");
    e.commands.selectAll();
    key(e, "b", { ctrl: true, code: 66 });
    expect(docToBody(e.getJSON())).toBe("**글자**\n");
    key(e, "e", { ctrl: true, code: 69 });
    expect(docToBody(e.getJSON())).toBe("**`글자`**\n");
    const e2 = make("글자");
    e2.commands.selectAll();
    key(e2, "s", { ctrl: true, shift: true, code: 83 });
    expect(docToBody(e2.getJSON())).toBe("~~글자~~\n");
  });
});

describe("블록은 지금 줄 '다음'에 넣는다", () => {
  it("제목 가운데에 커서가 있어도 제목을 쪼개지 않는다", () => {
    const e = make("## 시보 추가하기\n\n본문\n");
    e.commands.setTextSelection(4); // '시보' 사이
    insertBlocks(e, blocksFor.callout("warn"));
    const json = e.getJSON().content!;
    expect(json.map((n) => n.type)).toEqual(["heading", "callout", "paragraph"]);
    expect((json[0].content![0] as { text?: string }).text).toBe("시보 추가하기");
    // 커서는 새 상자 안
    expect(e.state.selection.$from.node(1).type.name).toBe("callout");
  });
  it("빈 문단이면 그 자리를 바꿔 끼운다", () => {
    const e = make("앞\n");
    e.commands.focus("end");
    e.commands.enter();
    insertBlocks(e, blocksFor.table(2, 2, true));
    expect(e.getJSON().content!.map((n) => n.type)).toEqual(["paragraph", "table", "paragraph"]);
  });
  it("목록·표 안에서는 목록·표 다음에", () => {
    const e = make("- 하나\n- 둘\n\n끝\n");
    e.commands.setTextSelection(4);
    insertBlocks(e, blocksFor.steps());
    expect(e.getJSON().content!.map((n) => n.type)).toEqual(["bulletList", "steps", "paragraph"]);
  });
  it("상자 안에서는 상자 안 다음 줄에", () => {
    const e = make('<Callout type="info">\n첫 줄\n</Callout>\n');
    e.commands.setTextSelection(3);
    insertBlocks(e, blocksFor.codeBlock());
    const c = e.getJSON().content![0];
    expect(c.type).toBe("callout");
    expect(c.content!.map((n) => n.type)).toEqual(["paragraph", "codeBlock"]);
  });
});
