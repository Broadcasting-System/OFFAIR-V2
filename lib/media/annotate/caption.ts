/**
 * 번호 설명 → 캡션 글.  ["그룹 탭", "편집 패널"] → "① 그룹 탭  ② 편집 패널"
 */

/** 1 → ①, 20 → ⑳, 21 부터는 (21) */
export function circled(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1);
  return `(${n})`;
}

/**
 * 설명이 빈 번호는 캡션에서 뺀다. 번호 자체는 그림 속 차례 그대로 유지
 * (②가 비어 있으면 "① 그룹 탭  ③ 적용하기").
 */
export function legendToCaption(legend: string[]): string {
  return legend
    .map((t, i) => [i + 1, t.replace(/\s+/g, " ").trim()] as const)
    .filter(([, t]) => t.length > 0)
    .map(([n, t]) => `${circled(n)} ${t}`)
    .join("  ");
}
