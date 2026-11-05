/**
 * 표시 달기(그림 위 번호·상자·화살표·글·가리기) 데이터 모델.
 * 좌표는 모두 "그림의 실제 픽셀" 기준이다. 화면 크기와 상관없이 같은 값.
 */

export type MarkColor = "red" | "blue" | "yellow";

/** 그림에 구워지는 색 — 테마와 무관하게 고정 */
export const MARK_COLORS: Record<MarkColor, { fill: string; on: string; label: string }> = {
  red: { fill: "#e2483d", on: "#ffffff", label: "빨강" },
  blue: { fill: "#0c66e4", on: "#ffffff", label: "파랑" },
  yellow: { fill: "#f5cd47", on: "#172b4d", label: "노랑" },
};

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** ① 번호 — 순서(배열 안 번호 표시들의 차례)가 곧 번호. label 은 그림 아래 설명. */
export interface NumberMark {
  id: string;
  type: "number";
  x: number;
  y: number;
  color: MarkColor;
  label: string;
}

export interface BoxMark extends Rect {
  id: string;
  type: "box";
  color: MarkColor;
}

export interface ArrowMark {
  id: string;
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: MarkColor;
}

export interface TextMark {
  id: string;
  type: "text";
  x: number;
  y: number;
  text: string;
  color: MarkColor;
}

/** 가리기 — 내보낼 때 픽셀에 구워진다. 사이드카에는 남지 않는다(이미 base 에 반영). */
export interface RedactMark extends Rect {
  id: string;
  type: "redact";
}

export type Mark = NumberMark | BoxMark | ArrowMark | TextMark | RedactMark;
/** 다시 고칠 수 있게 사이드카에 남는 표시 */
export type EditableMark = Exclude<Mark, RedactMark>;

/** 편집 중인 상태 (되돌리기 단위) */
export interface AnnotationDoc {
  marks: Mark[];
  /** 자르기 영역 (원본 좌표). 없으면 그림 전체 */
  crop: Rect | null;
}

/**
 * 다시 고치기용 사이드카.
 * base 는 "가리기·자르기는 적용됐고 표시는 안 그린" 그림의 주소.
 * 가리기 전 원본은 어디에도 남기지 않는다.
 */
export interface AnnotationSidecar {
  v: 1;
  base: string;
  /** base 그림 크기 — base 가 나중에 줄어들어도 표시 좌표를 맞춰 늘리고 줄이는 데 쓴다 */
  w: number;
  h: number;
  marks: EditableMark[];
  /** 번호 설명. legend[0] 이 ① */
  legend: string[];
}
