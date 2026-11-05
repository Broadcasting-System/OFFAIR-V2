/**
 * 가리기(모자이크) — 픽셀 배열을 직접 고치는 순수 함수.
 * canvas 의 ImageData 와 같은 모양({data, width, height})이면 무엇이든 받는다.
 */

import { intersectRect, roundRect } from "./geometry";
import type { Rect } from "./types";

export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * rect 영역을 block×block 칸마다 평균색 하나로 칠한다 (제자리 수정).
 * 칸은 rect 의 왼쪽 위에서부터 나눈다. 영역이 칸보다 작으면 통째로 한 색.
 * 원래 픽셀 값은 평균 말고는 남지 않는다.
 */
export function pixelate(buf: PixelBuffer, rect: Rect, block: number): void {
  const r = intersectRect(roundRect(rect), { x: 0, y: 0, w: buf.width, h: buf.height });
  if (!r) return;
  const b = Math.max(1, Math.round(block));
  const { data, width } = buf;
  for (let by = r.y; by < r.y + r.h; by += b) {
    const yEnd = Math.min(by + b, r.y + r.h);
    for (let bx = r.x; bx < r.x + r.w; bx += b) {
      const xEnd = Math.min(bx + b, r.x + r.w);
      let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
      for (let y = by; y < yEnd; y++) {
        let i = (y * width + bx) * 4;
        for (let x = bx; x < xEnd; x++, i += 4) {
          sr += data[i];
          sg += data[i + 1];
          sb += data[i + 2];
          sa += data[i + 3];
          n++;
        }
      }
      const cr = Math.round(sr / n), cg = Math.round(sg / n), cb = Math.round(sb / n), ca = Math.round(sa / n);
      for (let y = by; y < yEnd; y++) {
        let i = (y * width + bx) * 4;
        for (let x = bx; x < xEnd; x++, i += 4) {
          data[i] = cr;
          data[i + 1] = cg;
          data[i + 2] = cb;
          data[i + 3] = ca;
        }
      }
    }
  }
}

/** 여러 영역을 차례로 가린다. */
export function applyRedactions(buf: PixelBuffer, rects: Rect[], block: number): void {
  for (const r of rects) pixelate(buf, r, block);
}
