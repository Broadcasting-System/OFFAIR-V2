/**
 * 표시의 기하 계산 — 크기 기준, 늘리기·줄이기, 자르기, 맞히기(hit test), 손잡이.
 * DOM 을 쓰지 않는 순수 함수만 둔다 (테스트 대상).
 */

import type { EditableMark, Mark, Point, Rect } from "./types";

/** 그림 크기에 맞춘 선 굵기·번호 크기 등. 긴 변 1280px 기준 선 4px. */
export interface MarkMetrics {
  stroke: number;
  /** 번호 동그라미 반지름 */
  radius: number;
  /** 번호 글자 크기 */
  numberFont: number;
  /** 글 표시 글자 크기 */
  textFont: number;
  /** 글 표시 안쪽 여백 */
  textPad: number;
  /** 상자 모서리 둥글기 */
  boxRadius: number;
  /** 화살촉 길이 */
  head: number;
  /** 가리기 모자이크 칸 크기 */
  block: number;
}

export function metricsFor(width: number, height: number): MarkMetrics {
  const long = Math.max(1, width, height);
  const stroke = clamp(Math.round(long / 320), 2, 12);
  const radius = Math.max(11, Math.round(stroke * 4.5));
  return {
    stroke,
    radius,
    numberFont: Math.round(radius * 1.05),
    textFont: Math.max(13, Math.round(stroke * 4.5)),
    textPad: Math.max(4, Math.round(stroke * 1.6)),
    boxRadius: Math.round(stroke * 2.2),
    head: Math.round(stroke * 4.2),
    block: redactBlockSize(width, height),
  };
}

/**
 * 가리기 모자이크 칸 크기. 일부러 거칠게(대략 글자 높이 이상) 잡아
 * 모자이크를 되돌려 글자를 복원하는 공격(depix 류)이 통하지 않게 한다.
 */
export function redactBlockSize(width: number, height: number): number {
  return Math.max(12, Math.round(Math.max(width, height) / 64));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 두 점으로 정규화된 사각형 */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const btm = Math.min(a.y + a.h, b.y + b.h);
  if (r <= x || btm <= y) return null;
  return { x, y, w: r - x, h: btm - y };
}

export function roundRect(r: Rect): Rect {
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  return { x, y, w: Math.round(r.x + r.w) - x, h: Math.round(r.y + r.h) - y };
}

export function pointInRect(p: Point, r: Rect, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

/* ───────────────────────── 옮기기·늘리기·자르기 ───────────────────────── */

export function translateMark<M extends Mark>(m: M, dx: number, dy: number): M {
  switch (m.type) {
    case "arrow":
      return { ...m, x1: m.x1 + dx, y1: m.y1 + dy, x2: m.x2 + dx, y2: m.y2 + dy };
    default:
      return { ...m, x: m.x + dx, y: m.y + dy };
  }
}

export function scaleMark<M extends Mark>(m: M, sx: number, sy: number): M {
  switch (m.type) {
    case "arrow":
      return { ...m, x1: m.x1 * sx, y1: m.y1 * sy, x2: m.x2 * sx, y2: m.y2 * sy };
    case "box":
    case "redact":
      return { ...m, x: m.x * sx, y: m.y * sy, w: m.w * sx, h: m.h * sy };
    default:
      return { ...m, x: m.x * sx, y: m.y * sy };
  }
}

export function scaleMarks<M extends Mark>(marks: M[], sx: number, sy: number): M[] {
  return marks.map((m) => scaleMark(m, sx, sy));
}

/**
 * Liang–Barsky 선분 자르기. 사각형 밖으로 완전히 나가면 null.
 */
export function clipSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: Rect
): [number, number, number, number] | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

/**
 * 자르기 영역 기준으로 표시를 옮기고, 영역 밖으로 나간 것은 잘라 내거나 버린다.
 * 결과 좌표는 잘린 그림의 (0,0) 기준.
 */
export function cropMarks<M extends Mark>(marks: M[], crop: Rect): M[] {
  const bounds: Rect = { x: 0, y: 0, w: crop.w, h: crop.h };
  const out: M[] = [];
  for (const m0 of marks) {
    const m = translateMark(m0, -crop.x, -crop.y);
    switch (m.type) {
      case "box":
      case "redact": {
        const r = intersectRect(m, bounds);
        if (r) out.push({ ...m, ...r });
        break;
      }
      case "arrow": {
        const s = clipSegment(m.x1, m.y1, m.x2, m.y2, bounds);
        if (s) out.push({ ...m, x1: s[0], y1: s[1], x2: s[2], y2: s[3] });
        break;
      }
      default:
        if (pointInRect(m, bounds)) out.push(m);
    }
  }
  return out;
}

/* ───────────────────────── 맞히기·손잡이 ───────────────────────── */

export function distToSegment(p: Point, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((p.x - x1) * dx + (p.y - y1) * dy) / len2, 0, 1);
  return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
}

/** 글 표시의 대략 크기 (측정기가 없을 때). 한글은 글자 폭 ≈ 글자 크기. */
export function estimateTextWidth(text: string, font: number): number {
  let w = 0;
  for (const ch of text) w += /[\u0000-ÿ]/.test(ch) ? font * 0.58 : font;
  return w;
}

export type TextMeasure = (text: string, font: number) => number;

export function textBox(
  m: { x: number; y: number; text: string },
  mt: MarkMetrics,
  measure: TextMeasure = estimateTextWidth
): Rect {
  const w = measure(m.text || " ", mt.textFont) + mt.textPad * 2;
  const h = mt.textFont * 1.25 + mt.textPad * 2;
  // (x, y) 는 글 상자의 왼쪽 가운데
  return { x: m.x, y: m.y - h / 2, w, h };
}

export function markBounds(m: Mark, mt: MarkMetrics, measure?: TextMeasure): Rect {
  switch (m.type) {
    case "number":
      return { x: m.x - mt.radius, y: m.y - mt.radius, w: mt.radius * 2, h: mt.radius * 2 };
    case "box":
    case "redact":
      return { x: m.x, y: m.y, w: m.w, h: m.h };
    case "arrow":
      return rectFromPoints({ x: m.x1, y: m.y1 }, { x: m.x2, y: m.y2 });
    case "text":
      return textBox(m, mt, measure);
  }
}

/**
 * 점 p 를 맞힌 맨 위 표시. tol 은 그림 픽셀 단위 허용 오차(화면 확대율 반영해서 넘긴다).
 * 상자는 테두리 근처만 맞는다 — 상자 안의 다른 표시를 고를 수 있게.
 */
export function hitTest(
  marks: Mark[],
  p: Point,
  mt: MarkMetrics,
  tol: number,
  measure?: TextMeasure
): Mark | null {
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    switch (m.type) {
      case "number":
        if (Math.hypot(p.x - m.x, p.y - m.y) <= mt.radius + tol) return m;
        break;
      case "text":
        if (pointInRect(p, textBox(m, mt, measure), tol)) return m;
        break;
      case "redact":
        if (pointInRect(p, m, tol)) return m;
        break;
      case "box": {
        const edge = mt.stroke / 2 + tol;
        const outer = pointInRect(p, m, edge);
        const inner =
          m.w > edge * 2 && m.h > edge * 2 &&
          pointInRect(p, { x: m.x + edge, y: m.y + edge, w: m.w - edge * 2, h: m.h - edge * 2 });
        if (outer && !inner) return m;
        break;
      }
      case "arrow":
        if (distToSegment(p, m.x1, m.y1, m.x2, m.y2) <= mt.stroke / 2 + tol) return m;
        break;
    }
  }
  return null;
}

export type HandleId = "nw" | "ne" | "sw" | "se" | "start" | "end";

export function handlesFor(m: Mark): { id: HandleId; x: number; y: number }[] {
  switch (m.type) {
    case "box":
    case "redact":
      return [
        { id: "nw", x: m.x, y: m.y },
        { id: "ne", x: m.x + m.w, y: m.y },
        { id: "sw", x: m.x, y: m.y + m.h },
        { id: "se", x: m.x + m.w, y: m.y + m.h },
      ];
    case "arrow":
      return [
        { id: "start", x: m.x1, y: m.y1 },
        { id: "end", x: m.x2, y: m.y2 },
      ];
    default:
      return [];
  }
}

export function hitHandle(m: Mark, p: Point, tol: number): HandleId | null {
  for (const h of handlesFor(m)) {
    if (Math.hypot(p.x - h.x, p.y - h.y) <= tol) return h.id;
  }
  return null;
}

/** 손잡이를 p 로 끌었을 때의 표시. 상자는 반대쪽 모서리를 고정한다. */
export function resizeMark<M extends Mark>(m: M, handle: HandleId, p: Point): M {
  if (m.type === "arrow") {
    return handle === "start" ? { ...m, x1: p.x, y1: p.y } : { ...m, x2: p.x, y2: p.y };
  }
  if (m.type === "box" || m.type === "redact") {
    const fixed: Point = {
      x: handle === "nw" || handle === "sw" ? m.x + m.w : m.x,
      y: handle === "nw" || handle === "ne" ? m.y + m.h : m.y,
    };
    return { ...m, ...rectFromPoints(fixed, p) };
  }
  return m;
}

/** 번호 표시만 골라 차례대로 */
export function numberMarks<M extends Mark>(marks: M[]): Extract<M, { type: "number" }>[] {
  return marks.filter((m): m is Extract<M, { type: "number" }> => m.type === "number");
}

export function isEditable(m: Mark): m is EditableMark {
  return m.type !== "redact";
}
