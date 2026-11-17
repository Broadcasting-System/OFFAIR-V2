/**
 * 본문 글 댓글의 "자리" (순수 함수 — 서버·브라우저·편집기 어디서든, 테스트한다).
 *
 * 자리는 글자 위치가 아니라 "고른 글(quote) + 앞뒤 32자(prefix/suffix) + 블록 번호·소제목" 으로
 * 기억한다. 본문이 조금 바뀌어도 고른 글이 남아 있으면 다시 찾는다:
 *  1. quote 가 한 곳에만 있으면 거기
 *  2. 여러 곳이면 앞뒤 글이 가장 많이 맞는 곳 (같으면 원래 블록에 가까운 곳)
 *  3. 그대로는 없으면 공백 차이를 무시하고 한 번 더
 *  4. 그래도 없으면 null → "본문이 바뀌어 위치를 찾지 못했어요"
 */

export interface Anchor {
  quote: string;
  prefix: string;
  suffix: string;
  /** 본문 최상위 블록 번호 (0부터). 여러 곳이 맞을 때 고르는 데만 쓴다 */
  block?: number | null;
  /** 가장 가까운 위 소제목 */
  heading?: string | null;
}

export const CONTEXT = 32;
export const MAX_QUOTE = 500;

/** text[start, end) 를 고른 자리 */
export function makeAnchor(text: string, start: number, end: number, extra: { block?: number | null; heading?: string | null } = {}): Anchor | null {
  const a = Math.max(0, Math.min(start, end));
  const b = Math.min(text.length, Math.max(start, end));
  const raw = text.slice(a, b);
  // 앞뒤 공백은 자리에서 뺀다
  const lead = raw.length - raw.trimStart().length;
  const trail = raw.length - raw.trimEnd().length;
  const s = a + lead;
  const e = b - trail;
  if (e <= s) return null;
  return {
    quote: text.slice(s, e).slice(0, MAX_QUOTE),
    prefix: text.slice(Math.max(0, s - CONTEXT), s),
    suffix: text.slice(e, e + CONTEXT),
    block: extra.block ?? null,
    heading: extra.heading ?? null,
  };
}

/** a 의 끝과 b 의 끝이 몇 글자 같은가 */
function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

function allIndexes(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) out.push(i);
  return out;
}

/**
 * 본문 글(text)에서 자리를 다시 찾는다. blockStarts 는 각 최상위 블록이 text 에서 시작하는 위치
 * (있으면 같은 점수일 때 원래 블록에 가까운 쪽을 고른다).
 */
export function locateAnchor(text: string, anchor: Anchor, blockStarts?: number[]): { start: number; end: number } | null {
  if (!anchor?.quote) return null;
  const pick = (cands: number[], len: number, hay: string, pre: string, suf: string) => {
    if (cands.length === 0) return null;
    if (cands.length === 1) return cands[0];
    let best = cands[0];
    let bestScore = -1;
    let bestDist = Infinity;
    for (const at of cands) {
      const score = commonSuffix(hay.slice(Math.max(0, at - pre.length), at), pre) + commonPrefix(hay.slice(at + len, at + len + suf.length), suf);
      let dist = Infinity;
      if (blockStarts && typeof anchor.block === "number") {
        const blockOf = blockStarts.filter((b) => b <= at).length - 1;
        dist = Math.abs(blockOf - anchor.block);
      }
      if (score > bestScore || (score === bestScore && dist < bestDist)) {
        best = at;
        bestScore = score;
        bestDist = dist;
      }
    }
    return best;
  };

  const exact = pick(allIndexes(text, anchor.quote), anchor.quote.length, text, anchor.prefix, anchor.suffix);
  if (exact !== null) return { start: exact, end: exact + anchor.quote.length };

  // 공백 차이 무시: 글을 공백 한 칸으로 줄인 사본에서 찾고, 원래 위치로 되돌린다
  const map: number[] = [];
  let squashed = "";
  let prevSpace = false;
  for (let i = 0; i < text.length; i++) {
    const sp = /\s/.test(text[i]);
    if (sp && prevSpace) continue;
    squashed += sp ? " " : text[i];
    map.push(i);
    prevSpace = sp;
  }
  map.push(text.length);
  const sq = (s: string) => s.replace(/\s+/g, " ");
  const q = sq(anchor.quote).trim();
  const at = pick(allIndexes(squashed, q), q.length, squashed, sq(anchor.prefix), sq(anchor.suffix));
  if (at === null) return null;
  return { start: map[at], end: map[at + q.length - 1] + 1 };
}

/** 저장할 수 있는 자리인지 확인하고 크기를 자른다 (서버에서 씀) */
export function cleanAnchor(input: unknown): Anchor | null {
  if (!input || typeof input !== "object") return null;
  const a = input as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\u0000/g, "").slice(0, max) : "");
  const quote = str(a.quote, MAX_QUOTE).trim();
  if (!quote) return null;
  const block = typeof a.block === "number" && Number.isFinite(a.block) && a.block >= 0 ? Math.floor(a.block) : null;
  const heading = typeof a.heading === "string" ? str(a.heading, 200) : null;
  return { quote, prefix: str(a.prefix, CONTEXT * 2), suffix: str(a.suffix, CONTEXT * 2), block, heading };
}
