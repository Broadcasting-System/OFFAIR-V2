/**
 * 검색 팔레트의 글자 다루기 (순수 함수 — 테스트한다).
 *  - 검색어 → 낱말들
 *  - 결과 제목·본문 조각에서 검색어를 형광펜으로 칠할 구간 나누기
 *  - 최근 본 문서·최근 찾은 말 목록 다루기 (저장소는 바깥에서 넣어 준다)
 */

export interface Segment {
  text: string;
  mark: boolean;
}

/** 검색어를 낱말로 (공백으로 나누고, 같은 말은 한 번만, 긴 말 먼저) */
export function queryTokens(q: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of q.trim().toLowerCase().split(/\s+/)) {
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.sort((a, b) => b.length - a.length);
}

/**
 * text 에서 낱말이 나온 곳을 모두 칠한다 (대소문자 무시). 겹치거나 붙은 구간은 하나로 합친다.
 * "장비 음원" 처럼 붙어 나오면 한 덩어리로 칠해진다 (가운데 공백까지).
 */
export function highlight(text: string, q: string | string[]): Segment[] {
  const tokens = Array.isArray(q) ? q : queryTokens(q);
  if (!text) return [];
  if (tokens.length === 0) return [{ text, mark: false }];
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const t of tokens) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(t, from);
      if (at === -1) break;
      ranges.push([at, at + t.length]);
      from = at + t.length;
    }
  }
  if (ranges.length === 0) return [{ text, mark: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    // 겹치거나, 사이가 공백 하나뿐이면 합친다
    if (last && (r[0] <= last[1] || /^\s$/.test(text.slice(last[1], r[0])))) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const out: Segment[] = [];
  let pos = 0;
  for (const [a, b] of merged) {
    if (a > pos) out.push({ text: text.slice(pos, a), mark: false });
    out.push({ text: text.slice(a, b), mark: true });
    pos = b;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), mark: false });
  return out;
}

/**
 * 긴 본문 조각을 첫 일치 앞뒤로 잘라 보여 줄 만큼만 (앞뒤가 잘리면 …).
 * 서버 조각이 이미 짧으면 그대로.
 */
export function trimSnippet(text: string, q: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const tokens = queryTokens(q);
  const lower = clean.toLowerCase();
  let at = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  const start = at <= 30 ? 0 : at - 30;
  const end = Math.min(clean.length, start + max);
  return (start > 0 ? "…" : "") + clean.slice(start, end).trim() + (end < clean.length ? "…" : "");
}

/* ───────────── 최근 목록 ───────────── */

export interface RecentDoc {
  space: "guide" | "members";
  url: string;
  title: string;
  category?: string;
}

/** 맨 앞에 넣고, 같은 주소는 빼고, max 개까지 */
export function pushRecentDoc(list: RecentDoc[], doc: RecentDoc, max = 8): RecentDoc[] {
  return [doc, ...list.filter((d) => d.url !== doc.url)].slice(0, max);
}

export function pushRecentQuery(list: string[], q: string, max = 6): string[] {
  const t = q.trim();
  if (!t) return list;
  return [t, ...list.filter((x) => x !== t)].slice(0, max);
}

/** localStorage 에서 안전하게 읽기 (깨졌거나 없으면 빈 목록) */
export function readList<T>(raw: string | null, valid: (x: unknown) => x is T): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(valid) : [];
  } catch {
    return [];
  }
}

export function isRecentDoc(x: unknown): x is RecentDoc {
  const d = x as RecentDoc;
  return !!d && typeof d.url === "string" && typeof d.title === "string" && (d.space === "guide" || d.space === "members");
}

export function isString(x: unknown): x is string {
  return typeof x === "string";
}
