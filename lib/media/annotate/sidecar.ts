/**
 * 다시 고치기용 사이드카 만들기·읽기.
 *
 * - 만들 때: 자르기 기준으로 표시를 옮기고, 가리기 표시는 뺀다 (이미 base 픽셀에 구워짐).
 * - 읽을 때: 모양을 검사하고, base 실제 크기가 w/h 와 다르면 좌표를 맞춰 늘리고 줄인다.
 */

import { cropMarks, isEditable, numberMarks, scaleMarks } from "./geometry";
import type { AnnotationDoc, AnnotationSidecar, EditableMark, MarkColor, Rect } from "./types";

export function buildSidecar(
  doc: AnnotationDoc,
  image: { width: number; height: number },
  base: string
): AnnotationSidecar {
  const crop: Rect = doc.crop ?? { x: 0, y: 0, w: image.width, h: image.height };
  const marks = cropMarks(doc.marks.filter(isEditable), crop).map(roundMark);
  return {
    v: 1,
    base,
    w: Math.round(crop.w),
    h: Math.round(crop.h),
    marks,
    legend: numberMarks(marks).map((m) => m.label),
  };
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 좌표를 소수 한 자리로 (사이드카 JSON 을 짧게) */
export function roundMark(m: EditableMark): EditableMark {
  switch (m.type) {
    case "arrow":
      return { ...m, x1: r1(m.x1), y1: r1(m.y1), x2: r1(m.x2), y2: r1(m.y2) };
    case "box":
      return { ...m, x: r1(m.x), y: r1(m.y), w: r1(m.w), h: r1(m.h) };
    default:
      return { ...m, x: r1(m.x), y: r1(m.y) };
  }
}

const COLORS: MarkColor[] = ["red", "blue", "yellow"];

function num(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("숫자가 아님");
  return v;
}

function color(v: unknown): MarkColor {
  return COLORS.includes(v as MarkColor) ? (v as MarkColor) : "red";
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

let seq = 0;
function freshId(v: unknown): string {
  return typeof v === "string" && v ? v : `m${Date.now().toString(36)}${(seq++).toString(36)}`;
}

/**
 * JSON(문자열이나 객체) → 사이드카. 모양이 틀리면 Error.
 * 알 수 없는 표시 종류는 조용히 버린다 (나중 버전과의 호환).
 */
export function parseSidecar(input: unknown): AnnotationSidecar {
  const o = typeof input === "string" ? JSON.parse(input) : input;
  if (!o || typeof o !== "object") throw new Error("사이드카 형식이 아니에요");
  const s = o as Record<string, unknown>;
  if (s.v !== 1) throw new Error(`모르는 사이드카 버전: ${String(s.v)}`);
  if (typeof s.base !== "string") throw new Error("base 주소가 없어요");
  const legend = Array.isArray(s.legend) ? s.legend.map(str) : [];
  const marks: EditableMark[] = [];
  let n = 0;
  for (const raw of Array.isArray(s.marks) ? s.marks : []) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Record<string, unknown>;
    const id = freshId(m.id);
    switch (m.type) {
      case "number":
        marks.push({
          id, type: "number", x: num(m.x), y: num(m.y), color: color(m.color),
          // legend 이 있으면 그쪽이 우선 (편집기 밖에서 설명만 고쳤을 수 있음)
          label: legend[n] ?? str(m.label),
        });
        n++;
        break;
      case "box":
        marks.push({ id, type: "box", x: num(m.x), y: num(m.y), w: num(m.w), h: num(m.h), color: color(m.color) });
        break;
      case "arrow":
        marks.push({ id, type: "arrow", x1: num(m.x1), y1: num(m.y1), x2: num(m.x2), y2: num(m.y2), color: color(m.color) });
        break;
      case "text":
        marks.push({ id, type: "text", x: num(m.x), y: num(m.y), text: str(m.text), color: color(m.color) });
        break;
    }
  }
  const w = typeof s.w === "number" && s.w > 0 ? s.w : 0;
  const h = typeof s.h === "number" && s.h > 0 ? s.h : 0;
  return { v: 1, base: s.base, w, h, marks, legend: numberMarks(marks).map((m) => m.label) };
}

/** base 를 실제로 열었더니 크기가 다르면(재압축 등) 좌표를 맞춘다. */
export function fitSidecarTo(
  sc: AnnotationSidecar,
  width: number,
  height: number
): EditableMark[] {
  if (!sc.w || !sc.h || (sc.w === width && sc.h === height)) return sc.marks;
  return scaleMarks(sc.marks, width / sc.w, height / sc.h);
}

export function serializeSidecar(sc: AnnotationSidecar): string {
  return JSON.stringify(sc);
}
