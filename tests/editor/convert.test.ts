/**
 * 변환기 경계 사례 — 중첩 목록, 서식 있는 표, 목록 든 상자, 그림 속성, 모르는 JSX …
 */
import { describe, expect, it } from "vitest";
import { bodyToDoc, mdxToDoc } from "@/lib/editor/mdx-to-doc";
import { docToBody, docToMdx } from "@/lib/editor/doc-to-mdx";
import { checkDoc, normalizedTree } from "./helpers";

/** 본문 → 편집기 문서 → 본문 */
const rt = (body: string) => docToBody(checkDoc(bodyToDoc(body)));
/** 그대로 돌아와야 하는 본문 */
const same = (body: string) => expect(rt(body)).toBe(body);
const types = (body: string) => (bodyToDoc(body).content ?? []).map((n) => n.type);

describe("목록", () => {
  it("중첩 글머리 목록이 그대로", () => same("- 하나\n  - 둘\n  - 셋\n    - 넷\n- 다섯\n"));
  it("번호 목록 시작 번호와 중첩", () => same("3. 셋\n4. 넷\n   - 안쪽\n"));
  it("느슨한 목록(항목 사이 빈 줄)", () => same("- 하나\n\n- 둘\n"));
  it("할 일 목록", () => {
    same("- [ ] 할 일\n- [x] 한 일\n");
    expect(types("- [ ] a\n")).toEqual(["taskList"]);
  });
  it("항목 안의 여러 문단·코드", () => same("- 첫 줄\n\n  둘째 문단\n\n  ```js\n  a()\n  ```\n"));
});

describe("표", () => {
  it("칸 안 서식(굵게·코드·링크·취소선)", () =>
    same("| **굵게** | `코드` |\n| --- | --- |\n| [링크](/docs/a) | ~~지움~~ |\n"));
  it("열 정렬 보존", () => same("| 왼 | 가 | 오 |\n| :-- | :-: | --: |\n| a | b | c |\n"));
  it("칸 안 줄바꿈은 <br />", () => {
    const doc = bodyToDoc("| a |\n| --- |\n| x<br />y |\n");
    const cell = doc.content![0].content![1].content![0];
    expect(cell.content!.map((n) => n.type)).toEqual(["text", "hardBreak", "text"]);
    expect(rt("| a |\n| --- |\n| x<br />y |\n")).toBe("| a |\n| --- |\n| x<br />y |\n");
  });
  it("칸 안 파이프 문자 이스케이프", () => same("| a \\| b |\n| --- |\n| c |\n"));
});

describe("상자(Callout)", () => {
  it("목록이 든 상자", () => {
    const src = '<Callout type="warn" title="조심">\n- 하나\n- 둘\n</Callout>\n';
    same(src);
    const c = bodyToDoc(src).content![0];
    expect(c.type).toBe("callout");
    expect(c.attrs).toMatchObject({ type: "warn", title: "조심" });
    expect(c.content![0].type).toBe("bulletList");
  });
  it("type 없는 상자는 type 없이 다시 쓴다", () => same("<Callout>\n내용\n</Callout>\n"));
  it("모르는 속성은 그대로 다시 쓴다", () => same('<Callout type="tip" id="x" open>\n내용\n</Callout>\n'));
  it("모르는 종류(type=\"weird\")나 식 속성은 원문 블록", () => {
    expect(types('<Callout type="weird">\n내용\n</Callout>\n')).toEqual(["rawBlock"]);
    expect(types("<Callout title={t}>\n내용\n</Callout>\n")).toEqual(["rawBlock"]);
    same('<Callout type="weird">\n내용\n</Callout>\n');
  });
  it("한 줄짜리 <Callout>…</Callout> 도 상자로", () => {
    expect(types('<Callout type="tip">짧은 팁</Callout>\n')).toEqual(["callout"]);
    expect(rt('<Callout type="tip">짧은 팁</Callout>\n')).toBe('<Callout type="tip">\n짧은 팁\n</Callout>\n');
  });
});

describe("단계·카드", () => {
  it("단계 — 단계 사이 빈 줄 없이, 내용은 들여쓰기", () =>
    same('<Steps>\n  <Step title="하나">\n    첫 단계\n  </Step>\n  <Step title="둘">\n    - 목록\n    - 도\n  </Step>\n</Steps>\n'));
  it("Step 아닌 자식이 섞인 Steps 는 원문 블록", () => {
    expect(types("<Steps>\n  글\n</Steps>\n")).toEqual(["rawBlock"]);
  });
  it("카드 묶음", () =>
    same('<CardGrid>\n  <Card href="/docs/a" title="가">\n    설명\n  </Card>\n  <Card title="나" />\n</CardGrid>\n'));
  it("상자 안 단계", () =>
    same('<Callout type="info">\n<Steps>\n  <Step title="하나">\n    내용\n  </Step>\n</Steps>\n</Callout>\n'));
});

describe("그림(Figure)", () => {
  it("모든 속성(숫자·불리언 포함)", () => {
    const src = '<Figure src="/a.webp" alt="설명" caption="캡션" width={1280} height={720} static />\n';
    same(src);
    expect(bodyToDoc(src).content![0].attrs).toMatchObject({ src: "/a.webp", alt: "설명", caption: "캡션", width: 1280, height: 720, static: true });
  });
  it('따옴표 숫자(width="640")는 {640} 로 정리', () =>
    expect(rt('<Figure src="/a.png" alt="" width="640" />\n')).toBe('<Figure src="/a.png" alt="" width={640} />\n'));
  it("캡션 안 따옴표", () => same('<Figure src="/a.png" alt="&#x22;a&#x22;" />\n'));
  it("src 없는 Figure 는 원문 블록", () => expect(types('<Figure alt="x" />\n')).toEqual(["rawBlock"]));
});

describe("모르는 MDX 는 글자 그대로", () => {
  it("모르는 JSX 블록", () => {
    const src = '<Foo bar="1">\n  **x**\n\n  - y\n</Foo>\n';
    same(src);
    expect(bodyToDoc(src).content![0]).toEqual({ type: "rawBlock", attrs: { source: '<Foo bar="1">\n  **x**\n\n  - y\n</Foo>' } });
  });
  it("상자 안에 들여쓴 모르는 JSX 도 들여쓰기를 걷어 보관", () => {
    const src = '<Callout type="tip">\n<Foo>\n  안쪽\n</Foo>\n</Callout>\n';
    same(src);
  });
  it("글 사이 모르는 JSX·식", () => {
    same("앞 <Bar x={1} /> 뒤 {1 + 1} 끝\n");
    const kinds = bodyToDoc("앞 <Bar /> 뒤\n").content![0].content!.map((n) => n.type);
    expect(kinds).toEqual(["text", "rawInline", "text"]);
  });
  it("import/export·식 블록", () => same('import { X } from "./x"\n\nexport const a = 1\n\n{a}\n\n본문\n'));
  it("각주·참조 링크", () => same("본문[^1] 과 [참조][r]\n\n[^1]: 각주\n\n[r]: https://example.com\n"));
});

describe("글자 서식", () => {
  it("Kbd·Badge·밑줄", () => same('<Kbd>⌘</Kbd> + <Kbd>S</Kbd> 그리고 <Badge tone="warn">LIVE</Badge>, <u>밑줄</u>\n'));
  it("겹친 서식 순서 유지", () => {
    // `***둘 다***` 는 한 번 `**_둘 다_**` 로 정리된 뒤 그대로 (뜻은 같다)
    expect(rt("***둘 다***\n")).toBe("**_둘 다_**\n");
    same("**_둘 다_** 와 **굵게 *안에 기울임***\n");
    same("**`시보 전송`** 을 누르세요\n");
  });
  it("링크 제목", () => same('[가이드](/docs/intro "소개")\n'));
  it("짝 없는 ~ 는 이스케이프하지 않는다", () => same("GROUP 1~5 탭\n"));
});

describe("물결 하나는 취소선이 아니다 (singleTilde: false)", () => {
  const marksOf = (body: string) =>
    JSON.stringify(bodyToDoc(body))
      .match(/"type":"strike"/g)?.length ?? 0;
  it("1~4 는 글자 그대로", () => {
    expect(marksOf("1~4번 채널\n")).toBe(0);
    same("1~4번 채널\n");
  });
  it("한 문단에 물결 둘 (~a~ 꼴)도 취소선 아님", () => {
    expect(marksOf("3~4초, 5~6초 기다려요\n")).toBe(0);
    same("3~4초, 5~6초 기다려요\n");
    expect(marksOf("~하나~\n")).toBe(0);
  });
  it("~~두 개~~ 는 취소선", () => {
    expect(marksOf("~~지움~~\n")).toBe(1);
    same("~~지움~~ 그리고 1~2\n");
  });
  it("글자 안의 ~~ 는 이스케이프해서 취소선이 되지 않게", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a ~~b~~ c" }] }] };
    const out = docToBody(doc);
    expect(marksOf(out)).toBe(0);
    expect(docToBody(checkDoc(bodyToDoc(out)))).toBe(out);
  });
  it("문단 안 줄바꿈은 띄어쓰기로 (렌더 결과 같음)", () => expect(rt("첫 줄\n둘째 줄\n")).toBe("첫 줄 둘째 줄\n"));
  it("굵게 끝 공백은 바깥으로", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "굵게 ", marks: [{ type: "bold" }] }, { type: "text", text: "보통" }] }] };
    expect(docToBody(doc)).toBe("**굵게** 보통\n");
  });
  it("자동 링크는 [주소](주소) 로 (MDX 는 <주소> 불가)", () => expect(rt("https://example.com\n")).toBe("[https://example.com](https://example.com)\n"));
  it("< 와 { 는 이스케이프", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a < b {c}" }] }] };
    const out = docToBody(doc);
    expect(normalizedTree(out)).toEqual(normalizedTree("a \\< b \\{c}\n"));
  });
});

describe("블록 기타", () => {
  it("코드 펜스 언어 + meta", () => same('```ts title="a.ts"\nconst a = 1\n```\n'));
  it("제목 단계 1~4, 인용, 구분선", () => same("# 하나\n\n## 둘\n\n### 셋\n\n#### 넷\n\n> 인용\n\n---\n\n끝\n"));
  it("문단 하나뿐인 이미지는 이미지 블록", () => {
    expect(types("![대체](/a.png)\n")).toEqual(["image"]);
    same('![대체](/a.png "제목")\n');
  });
  it('유튜브 링크 약속 [제목](주소 "youtube")', () => {
    const src = '[영상](https://youtu.be/abc "youtube")\n';
    expect(types(src)).toEqual(["youtube"]);
    same(src);
  });
  it("빈 문서", () => {
    expect(docToBody({ type: "doc", content: [{ type: "paragraph" }] })).toBe("");
    expect(bodyToDoc("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});

describe("머리말", () => {
  it("알려진 키는 정해진 순서, 그 밖의 키는 뒤에 보존", () => {
    const src = "---\norder: 2\ntags:\n  - a\ntitle: 제목\ncategory: 송출\ndescription: '설명: 콜론'\n---\n\n본문\n";
    const out = docToMdx(mdxToDoc(src));
    expect(out).toBe('---\ntitle: 제목\ndescription: "설명: 콜론"\ncategory: 송출\norder: 2\ntags:\n  - a\n---\n\n본문\n');
  });
  it("머리말 없던 파일에 빈 머리말을 만들지 않는다", () => expect(docToMdx(mdxToDoc("본문\n"))).toBe("본문\n"));
});

describe("붙여넣기용 일반 마크다운 읽기", () => {
  it("MDX 문법 오류가 될 < { 도 일반 마크다운으로 읽힌다", () => {
    const doc = bodyToDoc("# 제목\n\na < b {c}\n\n- x\n", { mdx: false });
    expect(doc.content!.map((n) => n.type)).toEqual(["heading", "paragraph", "bulletList"]);
  });
});
