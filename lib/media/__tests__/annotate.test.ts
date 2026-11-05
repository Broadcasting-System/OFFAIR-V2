import { describe, expect, it } from "vitest";
import { circled, legendToCaption } from "../annotate/caption";
import {
  clipSegment,
  cropMarks,
  hitTest,
  metricsFor,
  resizeMark,
  scaleMarks,
  translateMark,
} from "../annotate/geometry";
import { historyReducer, initHistory } from "../annotate/history";
import { buildSidecar, fitSidecarTo, parseSidecar, serializeSidecar } from "../annotate/sidecar";
import type { AnnotationDoc, Mark } from "../annotate/types";
import { parseYouTube, youTubeWatchUrl, normalizeHttpUrl } from "../url";

describe("범례 → 캡션", () => {
  it("시안 예시 그대로", () => {
    expect(legendToCaption(["그룹 탭", "편집 패널", "적용하기"])).toBe("① 그룹 탭  ② 편집 패널  ③ 적용하기");
  });
  it("빈 설명은 빼되 번호는 그림 차례 그대로", () => {
    expect(legendToCaption(["그룹 탭", "  ", "적용하기"])).toBe("① 그룹 탭  ③ 적용하기");
  });
  it("공백 정리", () => {
    expect(legendToCaption(["  편집\n 패널 "])).toBe("① 편집 패널");
  });
  it("20 넘으면 괄호", () => {
    expect(circled(1)).toBe("①");
    expect(circled(20)).toBe("⑳");
    expect(circled(21)).toBe("(21)");
  });
  it("비면 빈 글", () => {
    expect(legendToCaption([])).toBe("");
  });
});

const box: Mark = { id: "b", type: "box", x: 100, y: 50, w: 200, h: 100, color: "red" };
const num: Mark = { id: "n", type: "number", x: 320, y: 40, color: "red", label: "그룹 탭" };
const arrow: Mark = { id: "a", type: "arrow", x1: 0, y1: 0, x2: 400, y2: 200, color: "blue" };
const text: Mark = { id: "t", type: "text", x: 10, y: 300, text: "여기", color: "yellow" };
const redact: Mark = { id: "r", type: "redact", x: 20, y: 20, w: 50, h: 10 };

describe("표시 기하", () => {
  it("크기 기준 — 긴 변 1280 이면 선 4px", () => {
    const m = metricsFor(1280, 810);
    expect(m.stroke).toBe(4);
    expect(m.radius).toBe(18);
    expect(metricsFor(1920, 1080).stroke).toBe(6);
    expect(metricsFor(200, 100).stroke).toBe(2);
  });

  it("늘리고 줄이기", () => {
    const [b, n, a] = scaleMarks([box, num, arrow], 0.5, 2);
    expect(b).toMatchObject({ x: 50, y: 100, w: 100, h: 200 });
    expect(n).toMatchObject({ x: 160, y: 80, label: "그룹 탭" });
    expect(a).toMatchObject({ x1: 0, y1: 0, x2: 200, y2: 400 });
  });

  it("옮기기", () => {
    expect(translateMark(arrow, 5, -5)).toMatchObject({ x1: 5, y1: -5, x2: 405, y2: 195 });
    expect(translateMark(text, 1, 1)).toMatchObject({ x: 11, y: 301 });
  });

  it("자르기: 옮기고, 넘치는 상자는 잘리고, 밖의 번호는 빠진다", () => {
    const crop = { x: 150, y: 0, w: 300, h: 120 };
    const out = cropMarks([box, num, text, arrow], crop);
    const b = out.find((m) => m.id === "b")!;
    expect(b).toMatchObject({ x: 0, y: 50, w: 150, h: 70 });
    expect(out.find((m) => m.id === "n")).toMatchObject({ x: 170, y: 40 });
    expect(out.find((m) => m.id === "t")).toBeUndefined(); // y=300 은 밖
    const a = out.find((m) => m.id === "a")! as Extract<Mark, { type: "arrow" }>;
    // y = x/2 선이 x∈[150,240](=높이 120 까지) 로 잘림
    expect(a.x1).toBeCloseTo(0);
    expect(a.y1).toBeCloseTo(75);
    expect(a.x2).toBeCloseTo(90);
    expect(a.y2).toBeCloseTo(120);
  });

  it("선분 자르기 — 완전히 밖이면 null", () => {
    expect(clipSegment(-10, -10, -1, -1, { x: 0, y: 0, w: 10, h: 10 })).toBeNull();
    expect(clipSegment(2, 2, 8, 8, { x: 0, y: 0, w: 10, h: 10 })).toEqual([2, 2, 8, 8]);
  });

  it("손잡이로 늘리면 반대쪽 모서리는 고정", () => {
    expect(resizeMark(box, "se", { x: 400, y: 300 })).toMatchObject({ x: 100, y: 50, w: 300, h: 250 });
    expect(resizeMark(box, "nw", { x: 350, y: 200 })).toMatchObject({ x: 300, y: 150, w: 50, h: 50 });
    expect(resizeMark(arrow, "end", { x: 9, y: 9 })).toMatchObject({ x1: 0, y1: 0, x2: 9, y2: 9 });
  });

  it("상자는 테두리 근처만 맞고, 안쪽은 지나쳐 아래 표시를 고른다", () => {
    const mt = metricsFor(1280, 810);
    expect(hitTest([box], { x: 101, y: 100 }, mt, 4)?.id).toBe("b");
    expect(hitTest([box], { x: 200, y: 100 }, mt, 4)).toBeNull();
    expect(hitTest([redact, box], { x: 30, y: 25 }, mt, 4)?.id).toBe("r");
    expect(hitTest([box, num], { x: 322, y: 42 }, mt, 4)?.id).toBe("n");
  });
});

describe("사이드카", () => {
  const doc: AnnotationDoc = { marks: [box, redact, num, arrow, text], crop: null };

  it("만들기 → 글로 → 읽기 하면 같은 것", () => {
    const sc = buildSidecar(doc, { width: 1280, height: 810 }, "/uploads/dev/guide/a.base.webp");
    const back = parseSidecar(serializeSidecar(sc));
    expect(back).toEqual(sc);
    expect(sc.v).toBe(1);
    expect(sc.legend).toEqual(["그룹 탭"]);
    expect(sc.w).toBe(1280);
  });

  it("가리기는 base 픽셀에 구워지므로 사이드카에 남지 않는다", () => {
    const sc = buildSidecar(doc, { width: 1280, height: 810 }, "x");
    expect(sc.marks.some((m) => (m as Mark).type === "redact")).toBe(false);
    expect(sc.marks).toHaveLength(4);
  });

  it("자르기가 있으면 좌표가 잘린 그림 기준", () => {
    const sc = buildSidecar({ ...doc, crop: { x: 100, y: 0, w: 400, h: 200 } }, { width: 1280, height: 810 }, "x");
    expect(sc.w).toBe(400);
    expect(sc.h).toBe(200);
    expect(sc.marks.find((m) => m.id === "b")).toMatchObject({ x: 0, y: 50, w: 200, h: 100 });
    expect(sc.marks.find((m) => m.id === "n")).toMatchObject({ x: 220, y: 40 });
  });

  it("base 크기가 바뀌었으면 좌표를 맞춘다", () => {
    const sc = buildSidecar(doc, { width: 1280, height: 810 }, "x");
    const fitted = fitSidecarTo(sc, 640, 405);
    expect(fitted.find((m) => m.id === "b")).toMatchObject({ x: 50, y: 25, w: 100, h: 50 });
    expect(fitSidecarTo(sc, 1280, 810)).toBe(sc.marks);
  });

  it("legend 가 표시 안 label 보다 우선, 모르는 표시는 버림", () => {
    const sc = parseSidecar({
      v: 1,
      base: "b",
      w: 10,
      h: 10,
      marks: [
        { id: "1", type: "number", x: 1, y: 1, color: "blue", label: "옛 설명" },
        { id: "2", type: "sparkle", x: 1, y: 1 },
      ],
      legend: ["새 설명"],
    });
    expect(sc.marks).toHaveLength(1);
    expect(sc.legend).toEqual(["새 설명"]);
    expect(sc.marks[0]).toMatchObject({ label: "새 설명", color: "blue" });
  });

  it("버전이 다르거나 모양이 틀리면 Error", () => {
    expect(() => parseSidecar({ v: 2, base: "x", marks: [] })).toThrow();
    expect(() => parseSidecar("{")).toThrow();
    expect(() => parseSidecar({ v: 1, base: "x", marks: [{ type: "box", x: "a" }] })).toThrow();
  });
});

describe("되돌리기", () => {
  it("commit / begin+live / undo / redo", () => {
    let h = initHistory(0);
    h = historyReducer(h, { type: "commit", next: 1 });
    h = historyReducer(h, { type: "begin" });
    h = historyReducer(h, { type: "live", next: 2 });
    h = historyReducer(h, { type: "live", next: 3 });
    expect(h.present).toBe(3);
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(1); // 끌기 한 번은 되돌리기 한 번
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(0);
    h = historyReducer(h, { type: "redo" });
    h = historyReducer(h, { type: "redo" });
    expect(h.present).toBe(3);
    h = historyReducer(h, { type: "undo" });
    h = historyReducer(h, { type: "commit", next: 9 });
    expect(h.future).toEqual([]);
  });
});

describe("주소로", () => {
  it("유튜브 여러 모양", () => {
    expect(parseYouTube("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ id: "dQw4w9WgXcQ" });
    expect(parseYouTube("youtu.be/dQw4w9WgXcQ?t=90")).toEqual({ id: "dQw4w9WgXcQ", start: 90 });
    expect(parseYouTube("https://youtube.com/shorts/dQw4w9WgXcQ")).toEqual({ id: "dQw4w9WgXcQ" });
    expect(parseYouTube("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s")).toEqual({ id: "dQw4w9WgXcQ", start: 90 });
    expect(parseYouTube("https://www.youtube.com/embed/dQw4w9WgXcQ")).toEqual({ id: "dQw4w9WgXcQ" });
    expect(parseYouTube("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYouTube("https://youtube.com/watch?v=short")).toBeNull();
    expect(youTubeWatchUrl({ id: "dQw4w9WgXcQ", start: 90 })).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s");
  });
  it("http(s) 만", () => {
    expect(normalizeHttpUrl("example.com/a.png")).toBe("https://example.com/a.png");
    expect(normalizeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeHttpUrl("ftp://x.com/a.png")).toBeNull();
  });
});
