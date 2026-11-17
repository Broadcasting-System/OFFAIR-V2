/**
 * 표시를 canvas 에 그리고, 가리기를 구워 내보내기.
 *
 * 내보내기 순서 (중요):
 *   1) 자른 영역만 원본에서 옮겨 그림
 *   2) 가리기 영역을 모자이크로 덮어씀  → 이 시점의 그림이 base (사이드카용)
 *   3) 그 위에 번호·상자·화살표·글을 그림 → 최종 그림
 * 가리기 전 픽셀은 1) 의 canvas 안에서만 잠깐 있고, 어떤 Blob 으로도 나가지 않는다.
 */

import { cropMarks, isEditable, numberMarks, textBox, type MarkMetrics, type TextMeasure } from "./geometry";
import { applyRedactions, type PixelBuffer } from "./redact";
import { MARK_COLORS, type AnnotationDoc, type ArrowMark, type EditableMark, type Rect } from "./types";

/** 그림 글꼴 — 컴포넌트가 실제 계산된 font-family 로 덮어쓴다 */
export const DEFAULT_FONT_FAMILY =
  'Pretendard, "Pretendard Variable", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

export const NUMBER_WEIGHT = 800;
export const TEXT_WEIGHT = 700;

/** 화살표: 선 끝(촉 밑동)과 촉 세 점 */
export function arrowGeometry(m: Pick<ArrowMark, "x1" | "y1" | "x2" | "y2">, mt: MarkMetrics) {
  const dx = m.x2 - m.x1;
  const dy = m.y2 - m.y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const head = Math.min(mt.head, len * 0.6);
  const half = head * 0.6;
  const bx = m.x2 - ux * head;
  const by = m.y2 - uy * head;
  return {
    lineEnd: { x: m.x2 - ux * head * 0.7, y: m.y2 - uy * head * 0.7 },
    head: [
      { x: m.x2, y: m.y2 },
      { x: bx - uy * half, y: by + ux * half },
      { x: bx + uy * half, y: by - ux * half },
    ],
  };
}

/** 내보내기에 필요한 canvas 2D 기능만 (테스트에서 가짜로 바꿔 끼울 수 있게) */
export interface Ctx2D {
  canvas?: unknown;
  drawImage(image: unknown, dx: number, dy: number): void;
  getImageData(x: number, y: number, w: number, h: number): PixelBuffer;
  putImageData(data: PixelBuffer, x: number, y: number): void;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetY: number;
}

function roundRectPath(ctx: Ctx2D, r: Rect, rad: number) {
  const k = Math.max(0, Math.min(rad, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + k, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, k);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, k);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, k);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, k);
  ctx.closePath();
}

export function fontString(weight: number, size: number, family: string): string {
  return `${weight} ${size}px ${family}`;
}

/** 표시들을 canvas 에 그린다 (번호는 배열 속 차례대로 1, 2, 3…). */
export function drawMarks(
  ctx: Ctx2D,
  marks: EditableMark[],
  mt: MarkMetrics,
  family: string = DEFAULT_FONT_FAMILY
): void {
  let n = 0;
  const measureFor = (weight: number): TextMeasure => (text, size) => {
    ctx.font = fontString(weight, size, family);
    return ctx.measureText(text).width;
  };
  for (const m of marks) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const c = MARK_COLORS[m.color];
    switch (m.type) {
      case "box":
        ctx.strokeStyle = c.fill;
        ctx.lineWidth = mt.stroke;
        roundRectPath(ctx, m, mt.boxRadius);
        ctx.stroke();
        break;
      case "arrow": {
        const g = arrowGeometry(m, mt);
        ctx.strokeStyle = c.fill;
        ctx.fillStyle = c.fill;
        ctx.lineWidth = mt.stroke;
        ctx.beginPath();
        ctx.moveTo(m.x1, m.y1);
        ctx.lineTo(g.lineEnd.x, g.lineEnd.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(g.head[0].x, g.head[0].y);
        ctx.lineTo(g.head[1].x, g.head[1].y);
        ctx.lineTo(g.head[2].x, g.head[2].y);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "number": {
        n++;
        ctx.shadowColor = "rgba(0,0,0,0.28)";
        ctx.shadowBlur = mt.stroke * 1.5;
        ctx.shadowOffsetY = mt.stroke * 0.5;
        ctx.fillStyle = c.fill;
        ctx.beginPath();
        ctx.arc(m.x, m.y, mt.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = c.on;
        ctx.font = fontString(NUMBER_WEIGHT, mt.numberFont, family);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(n), m.x, m.y + mt.numberFont * 0.04);
        break;
      }
      case "text": {
        if (!m.text) break;
        const box = textBox(m, mt, measureFor(TEXT_WEIGHT));
        ctx.shadowColor = "rgba(0,0,0,0.22)";
        ctx.shadowBlur = mt.stroke;
        ctx.shadowOffsetY = mt.stroke * 0.4;
        ctx.fillStyle = c.fill;
        roundRectPath(ctx, box, mt.textPad * 1.2);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = c.on;
        ctx.font = fontString(TEXT_WEIGHT, mt.textFont, family);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(m.text, box.x + mt.textPad, m.y + mt.textFont * 0.04);
        break;
      }
    }
    ctx.restore();
  }
}

/** 자르기 영역 (없으면 그림 전체), 정수로 맞춤 */
export function effectiveCrop(doc: AnnotationDoc, width: number, height: number): Rect {
  const c = doc.crop ?? { x: 0, y: 0, w: width, h: height };
  const x = Math.max(0, Math.round(c.x));
  const y = Math.max(0, Math.round(c.y));
  return {
    x,
    y,
    w: Math.max(1, Math.min(width, Math.round(c.x + c.w)) - x),
    h: Math.max(1, Math.min(height, Math.round(c.y + c.h)) - y),
  };
}

/**
 * base 그리기: 자른 영역 + 가리기. ctx 는 crop.w × crop.h 크기여야 한다.
 * 반환: 그 위에 그릴 표시(자르기 기준 좌표)와 가리기가 하나라도 있었는지.
 */
export function renderBase(
  ctx: Ctx2D,
  image: unknown,
  doc: AnnotationDoc,
  width: number,
  height: number,
  mt: MarkMetrics
): { crop: Rect; marks: EditableMark[]; redacted: boolean } {
  const crop = effectiveCrop(doc, width, height);
  ctx.drawImage(image, -crop.x, -crop.y);
  const local = cropMarks(doc.marks, crop);
  const redactRects = local.filter((m) => m.type === "redact");
  if (redactRects.length) {
    const buf = ctx.getImageData(0, 0, crop.w, crop.h);
    applyRedactions(buf, redactRects, mt.block);
    ctx.putImageData(buf, 0, 0);
  }
  return { crop, marks: local.filter(isEditable), redacted: redactRects.length > 0 };
}

export interface ExportResult {
  /** 표시까지 다 그린 최종 그림 */
  blob: Blob;
  /** 가리기·자르기만 적용된 그림 (사이드카 base) */
  baseBlob: Blob;
  width: number;
  height: number;
  /**
   * base 가 원본과 픽셀이 같은지 (가리기·자르기가 없었음).
   * true 이고 원본이 이미 서버에 있으면 base 를 다시 올릴 필요가 없다.
   */
  baseUnchanged: boolean;
  /** 번호 설명 (legend[0] = ①) */
  legend: string[];
  /** 자르기 기준 좌표의 표시 (사이드카에 그대로 쓸 수 있음) */
  marks: EditableMark[];
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("그림을 만들지 못했어요"))), type, quality)
  );
}

/** WebP 로 굽되, 브라우저가 WebP 인코딩을 못 하면(구형 Safari) PNG */
export async function encodeCanvas(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  const webp = await canvasToBlob(canvas, "image/webp", quality);
  if (webp.type === "image/webp") return webp;
  return canvasToBlob(canvas, "image/png", 1);
}

/** 브라우저에서 실제로 내보내기. image 는 다 불러온 <img> 나 ImageBitmap. */
export async function exportAnnotation(
  image: CanvasImageSource,
  doc: AnnotationDoc,
  opts: { width: number; height: number; metrics: MarkMetrics; fontFamily?: string; quality?: number }
): Promise<ExportResult> {
  const { width, height, metrics } = opts;
  const crop = effectiveCrop(doc, width, height);
  const canvas = document.createElement("canvas");
  canvas.width = crop.w;
  canvas.height = crop.h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 를 쓸 수 없어요");
  const c2 = ctx as unknown as Ctx2D;
  const base = renderBase(c2, image, doc, width, height, metrics);
  const baseBlob = await encodeCanvas(canvas, opts.quality ?? 0.9);
  drawMarks(c2, base.marks, metrics, opts.fontFamily);
  const blob = await encodeCanvas(canvas, opts.quality ?? 0.9);
  // 가리기 전 픽셀이 남은 canvas 를 바로 비운다
  canvas.width = 0;
  canvas.height = 0;
  return {
    blob,
    baseBlob,
    width: crop.w,
    height: crop.h,
    baseUnchanged:
      !base.redacted && crop.x === 0 && crop.y === 0 && crop.w === width && crop.h === height,
    legend: numberMarks(base.marks).map((m) => m.label),
    marks: base.marks,
  };
}
