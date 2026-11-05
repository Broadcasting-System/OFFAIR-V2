/**
 * 가리기가 내보낸 그림에 실제로 구워지는지.
 *
 * jsdom/happy-dom 에는 진짜 canvas 가 없고 node-canvas 는 네이티브 빌드가 필요해서,
 * 픽셀 배열 위에서 도는 아주 작은 가짜 2D 컨텍스트로 내보내기 순서(renderBase → drawMarks)를
 * 그대로 돌려 본다. 실제 브라우저 확인은 개발 데모 + Playwright 로 따로 했다.
 */

import { describe, expect, it } from "vitest";
import { metricsFor } from "../annotate/geometry";
import { pixelate, type PixelBuffer } from "../annotate/redact";
import { drawMarks, renderBase, type Ctx2D } from "../annotate/render";
import type { AnnotationDoc } from "../annotate/types";

/** 체크무늬(0/255) — "비밀 글자" 대신. 평균 내면 원래 값이 남지 않는다. */
function checker(w: number, h: number): PixelBuffer {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = (x + y) % 2 ? 255 : 0;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  return { data, width: w, height: h };
}

function px(b: PixelBuffer, x: number, y: number) {
  const i = (y * b.width + x) * 4;
  return Array.from(b.data.slice(i, i + 4));
}

/** 픽셀 배열에 그리는 가짜 컨텍스트 (drawImage·getImageData·putImageData 만 진짜로) */
function fakeCtx(w: number, h: number) {
  const buf: PixelBuffer = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  const calls: string[] = [];
  const ctx: Ctx2D = {
    drawImage(image, dx, dy) {
      calls.push("drawImage");
      const src = image as PixelBuffer;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const sx = x - dx, sy = y - dy;
          if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
          const si = (sy * src.width + sx) * 4;
          buf.data.set(src.data.slice(si, si + 4), (y * w + x) * 4);
        }
    },
    getImageData(x, y, gw, gh) {
      calls.push("getImageData");
      const out = new Uint8ClampedArray(gw * gh * 4);
      for (let j = 0; j < gh; j++) out.set(buf.data.slice(((y + j) * w + x) * 4, ((y + j) * w + x + gw) * 4), j * gw * 4);
      return { data: out, width: gw, height: gh };
    },
    putImageData(d, x, y) {
      calls.push("putImageData");
      for (let j = 0; j < d.height; j++)
        buf.data.set(d.data.slice(j * d.width * 4, (j + 1) * d.width * 4), ((y + j) * w + x) * 4);
    },
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    arcTo() {},
    fill: () => calls.push("fill"),
    stroke: () => calls.push("stroke"),
    fillText: (t: string) => calls.push(`text:${t}`),
    measureText: (t: string) => ({ width: t.length * 10 }),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "",
    lineJoin: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetY: 0,
  };
  return { ctx, buf, calls };
}

describe("모자이크 (pixelate)", () => {
  it("칸마다 한 색, 원래 체크무늬 값은 남지 않음, 영역 밖은 그대로", () => {
    const b = checker(40, 40);
    pixelate(b, { x: 8, y: 8, w: 24, h: 12 }, 12);
    // 영역 안: 0 이나 255 가 아니라 평균(≈128)
    for (let y = 8; y < 20; y++)
      for (let x = 8; x < 32; x++) {
        const [r] = px(b, x, y);
        expect(r === 0 || r === 255).toBe(false);
      }
    // 한 칸 안은 모두 같은 색
    expect(px(b, 8, 8)).toEqual(px(b, 19, 19));
    // 밖은 원래 체크무늬
    expect(px(b, 7, 8)[0]).toBe(255);
    expect(px(b, 8, 7)[0]).toBe(255);
    expect(px(b, 32, 8)[0]).toBe(0);
  });

  it("그림 밖으로 넘친 영역도 안전하게 잘라서 처리", () => {
    const b = checker(10, 10);
    expect(() => pixelate(b, { x: -5, y: 5, w: 100, h: 100 }, 4)).not.toThrow();
    expect(px(b, 0, 0)[0]).toBe(0);
  });
});

describe("내보내기에 가리기가 구워짐", () => {
  it("자른 뒤 좌표로 가리고, base 시점에 이미 원본 픽셀이 없다; 표시는 그 뒤에 그린다", () => {
    const W = 64, H = 48;
    const src = checker(W, H);
    const doc: AnnotationDoc = {
      crop: { x: 8, y: 0, w: 48, h: 40 },
      marks: [
        { id: "r", type: "redact", x: 16, y: 8, w: 24, h: 16 }, // 원본 좌표
        { id: "n", type: "number", x: 30, y: 30, color: "red", label: "설명" },
      ],
    };
    const mt = { ...metricsFor(W, H), block: 12 };
    const { ctx, buf, calls } = fakeCtx(48, 40);

    const base = renderBase(ctx, src, doc, W, H, mt);
    expect(base.redacted).toBe(true);
    expect(base.crop).toEqual({ x: 8, y: 0, w: 48, h: 40 });
    // 자른 그림 좌표로 가리기 영역 = (8,8)-(32,24)
    for (let y = 8; y < 24; y++)
      for (let x = 8; x < 32; x++) {
        const [r] = px(buf, x, y);
        expect(r === 0 || r === 255).toBe(false);
      }
    // 가리기 밖은 원본(자른 만큼 밀린) 체크무늬
    expect(px(buf, 0, 0)[0]).toBe(src.data[(0 * W + 8) * 4]);
    // 사이드카용 표시에는 가리기가 없고 번호는 자른 좌표
    expect(base.marks).toEqual([{ id: "n", type: "number", x: 22, y: 30, color: "red", label: "설명" }]);

    const snapshot = buf.data.slice();
    const before = calls.length;
    drawMarks(ctx, base.marks, mt);
    // 표시는 base 다음에 그려진다 (base 픽셀은 가리기 이후 상태)
    expect(calls.slice(0, before)).toEqual(["drawImage", "getImageData", "putImageData"]);
    expect(calls.slice(before)).toContain("text:1");
    // 가짜 컨텍스트라 도형은 픽셀을 안 바꿈 → base 와 같음
    expect(buf.data).toEqual(snapshot);
  });

  it("가리기·자르기가 없으면 redacted=false", () => {
    const { ctx } = fakeCtx(10, 10);
    const r = renderBase(ctx, checker(10, 10), { marks: [], crop: null }, 10, 10, metricsFor(10, 10));
    expect(r.redacted).toBe(false);
    expect(r.crop).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });
});
