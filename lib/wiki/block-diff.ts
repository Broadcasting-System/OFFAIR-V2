import { diffArrays } from "diff";
import { GFM_OPTIONS, remarkGfm } from "@/lib/gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

/**
 * 수정 기록 "본문에서 바로 비교"용 블록 diff.
 *
 * 예전 본문과 지금 본문을 mdast 최상위 블록(문단·제목·목록·표·콜아웃 …)으로 나눠
 * 블록 단위로 맞춘 뒤, 바뀐 블록은 낱말 단위로 비교해 `<del>`/`<ins>` 를 MDX 원문에
 * 끼워 넣는다. 결과 조각(chunk)은 각각 따로 MDX 로 그린다:
 *  - same    : 지금 원문 그대로
 *  - added   : 통째로 더해진 블록 (초록 왼쪽 막대)
 *  - removed : 통째로 지워진 블록 (빨강 + 취소선)
 *  - changed : 지금 블록 안에 지운 말/더한 말을 표시한 원문. 그리기에 실패하면
 *              old/new 를 removed + added 로 대신 보여 준다.
 *
 * 표는 줄(row)끼리, 목록은 항목끼리 맞춰 칸·항목 안에서 낱말을 비교한다.
 * 구조가 달라 맞출 수 없으면 null → removed + added 로 떨어진다.
 */

export type DiffChunk =
  | { kind: "same"; source: string }
  | { kind: "added"; source: string }
  | { kind: "removed"; source: string }
  | { kind: "changed"; source: string; oldSource: string; newSource: string };

export type WordSegment = { type: "same" | "add" | "del"; text: string };

/** mdast 노드 (remark-mdx 노드까지 느슨하게) */
interface Pos {
  start: { offset?: number; column: number };
  end: { offset?: number };
}
interface MdNode {
  type: string;
  position?: Pos;
  children?: MdNode[];
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  checked?: boolean | null;
  name?: string | null;
  align?: (string | null)[] | null;
  value?: string;
}

const processor = unified().use(remarkParse).use(remarkGfm, GFM_OPTIONS).use(remarkMdx);

function parseBlocks(src: string): MdNode[] | null {
  try {
    const root = processor.parse(src) as unknown as MdNode;
    return (root.children ?? []).filter((n) => n.position && n.type !== "mdxjsEsm" && n.type !== "definition");
  } catch {
    return null;
  }
}

/** 빈 줄로만 나눈 거친 블록 (MDX 로 읽을 수 없는 예전 버전용) */
function roughBlocks(src: string): MdNode[] {
  const out: MdNode[] = [];
  const re = /[^\n](?:[\s\S]*?)(?=\n[ \t]*\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out.push({
      type: "raw",
      position: { start: { offset: m.index, column: 1 }, end: { offset: m.index + m[0].length } },
    });
  }
  return out;
}

const off = (n: MdNode) => [n.position!.start.offset ?? 0, n.position!.end.offset ?? 0] as const;
const slice = (n: MdNode, src: string) => {
  const [a, b] = off(n);
  return src.slice(a, b);
};

/** 블록 원문. 둘째 줄부터는 첫 줄의 들여쓰기만큼 걷어 낸다 (JSX 안 블록 등) */
function blockSource(n: MdNode, src: string): string {
  const col = Math.max(0, n.position!.start.column - 1);
  const text = slice(n, src);
  if (col === 0) return text;
  const re = new RegExp(`^[ \\t]{0,${col}}`);
  return text
    .split("\n")
    .map((l, i) => (i === 0 ? l : l.replace(re, "")))
    .join("\n");
}

function keyOf(n: MdNode, src: string): string {
  return blockSource(n, src)
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();
}

/* ───────────────────────── 낱말 나누기 ───────────────────────── */

const TOKEN_RE = /\\[\s\S]|&#?[A-Za-z0-9]+;|\s+|[\p{P}\p{S}]|[^\s\p{P}\p{S}\\&]+|[\\&]/gu;

/** 글자 → 낱말·공백·문장부호 조각 */
export function tokenize(text: string): string[] {
  return text.match(TOKEN_RE) ?? [];
}

const isSpace = (t: string) => /^\s+$/.test(t);

function words(tokens: string[]): string[] {
  return tokens.filter((t) => !isSpace(t));
}

/** 두 낱말 묶음이 얼마나 닮았나 (0~1, Dice 계수) */
export function similarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const count = new Map<string, number>();
  for (const w of a) count.set(w, (count.get(w) ?? 0) + 1);
  let common = 0;
  for (const w of b) {
    const c = count.get(w) ?? 0;
    if (c > 0) {
      common++;
      count.set(w, c - 1);
    }
  }
  return (2 * common) / (a.length + b.length);
}

/** 평문 두 개를 낱말 단위로 비교 (제목·설명처럼 마크다운이 아닌 글) */
export function wordDiff(oldText: string, newText: string): WordSegment[] {
  const out: WordSegment[] = [];
  for (const part of diffArrays(tokenize(oldText), tokenize(newText))) {
    const type = part.added ? "add" : part.removed ? "del" : "same";
    const text = part.value.join("");
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  }
  return out;
}

/* ───────────────────────── 인라인 (문단·제목·칸) ───────────────────────── */

const PHRASING = new Set([
  "text", "strong", "emphasis", "delete", "inlineCode", "link", "linkReference", "image", "imageReference",
  "break", "html", "footnoteReference", "mdxJsxTextElement", "mdxTextExpression",
]);

/**
 * 인라인 자식들을 비교용 조각으로. 글(text)은 낱말로 나누고, 굵게·링크·코드 같은
 * 나머지 인라인은 원문 통째로 한 조각이다 (`**` 사이를 가르면 문법이 깨지므로).
 */
function inlineTokens(parent: MdNode, src: string): string[] {
  const kids = parent.children ?? [];
  const tokens: string[] = [];
  const push = (ts: string[]) => {
    for (const t of ts) tokens.push(isSpace(t) ? " " : t);
  };
  let cursor = kids.length ? off(kids[0])[0] : 0;
  for (const k of kids) {
    if (!k.position) continue;
    const [a, b] = off(k);
    if (a > cursor) push(tokenize(src.slice(cursor, a)));
    if (k.type === "text") push(tokenize(src.slice(a, b)));
    else if (k.type === "break") tokens.push("<br />");
    else tokens.push(src.slice(a, b).replace(/\n[ \t]*/g, " "));
    cursor = b;
  }
  return tokens;
}

/** 낱말 비교 결과를 `<del>`/`<ins>` 를 끼운 MDX 로 */
function markTokens(oldT: string[], newT: string[]): string {
  type Part = { kind: "same" | "add" | "del"; text: string };
  const parts: Part[] = diffArrays(oldT, newT).map((p) => ({
    kind: p.added ? "add" : p.removed ? "del" : "same",
    text: p.value.join(""),
  }));
  let out = "";
  let i = 0;
  while (i < parts.length) {
    if (parts[i].kind === "same") {
      out += parts[i].text;
      i++;
      continue;
    }
    // 바뀐 조각들이 공백만 사이에 두고 이어지면 한 덩어리로 묶는다
    // ("<del>서버로</del><ins>고친</ins> <del>버튼</del>…" 대신 "<del>서버로 … 버튼</del><ins>…</ins>")
    let del = "";
    let ins = "";
    let j = i;
    while (j < parts.length) {
      const p = parts[j];
      if (p.kind === "del") del += p.text;
      else if (p.kind === "add") ins += p.text;
      else if (/^\s+$/.test(p.text) && parts[j + 1] && parts[j + 1].kind !== "same") {
        del += p.text;
        ins += p.text;
      } else break;
      j++;
    }
    i = j;
    if (del.trim()) out += `<del>${del.trim()}</del>`;
    if (ins.trim()) {
      // 더한 쪽 앞뒤 공백은 지금 글의 일부라 살린다
      out += ins.match(/^\s*/)![0] + `<ins>${ins.trim()}</ins>` + ins.match(/\s*$/)![0];
    } else if (ins) out += ins;
  }
  return out;
}

/** 줄 맨 앞이 JSX 태그면 MDX 가 문단 대신 블록으로 읽는다 → 보이지 않는 글자로 문단을 지킨다 */
function keepParagraph(s: string): string {
  return s.startsWith("<") ? "&#8203;" + s : s;
}

function annotateInline(o: MdNode, n: MdNode, oSrc: string, nSrc: string): string {
  return markTokens(inlineTokens(o, oSrc), inlineTokens(n, nSrc));
}

function wrapInline(tag: "ins" | "del", inner: string): string {
  return inner.trim() ? `<${tag}>${inner.trim()}</${tag}>` : inner;
}

/* ───────────────────────── 블록 짝짓기 ───────────────────────── */

function kindOf(n: MdNode): string {
  switch (n.type) {
    case "heading":
      return `h${n.depth}`;
    case "table":
      return `table${n.children?.[0]?.children?.length ?? 0}`;
    case "list":
      return n.ordered ? "ol" : "ul";
    case "mdxJsxFlowElement":
      return `jsx:${n.name ?? ""}`;
    default:
      return n.type;
  }
}

interface Pairing<T> {
  /** 새 쪽 순서대로: 같은 것 / 지운 것 / 더한 것 / 짝지어진 바뀐 것 */
  ops: ({ op: "same"; o: T; n: T } | { op: "del"; o: T } | { op: "add"; n: T } | { op: "pair"; o: T; n: T })[];
}

/**
 * 두 목록을 키로 맞추고(LCS), 지운 묶음과 더한 묶음 사이에서는 같은 종류·비슷한 글끼리 짝을 짓는다.
 */
function align<T>(
  olds: T[],
  news: T[],
  key: (x: T, side: "o" | "n") => string,
  canPair: (o: T, n: T) => boolean
): Pairing<T> {
  const ops: Pairing<T>["ops"] = [];
  const parts = diffArrays(
    olds.map((x) => key(x, "o")),
    news.map((x) => key(x, "n"))
  );
  let oi = 0;
  let ni = 0;
  // diff 는 지운 묶음과 더한 묶음을 어느 순서로든 낼 수 있다 → 같은 것이 나올 때까지 모았다 짝짓는다
  let pendingDel: T[] = [];
  let pendingAdd: T[] = [];
  const flushRun = () => {
    const added = pendingAdd;
    pendingAdd = [];
    let ri = 0;
    // 짝을 못 찾은 더함은 모아 두었다가, 그 앞의 지움 뒤에 낸다 (지움 → 더함 순서)
    let lone: T[] = [];
    for (const a of added) {
      let match = -1;
      for (let j = ri; j < pendingDel.length; j++) {
        if (canPair(pendingDel[j], a)) {
          match = j;
          break;
        }
      }
      if (match === -1) {
        lone.push(a);
        continue;
      }
      for (let j = ri; j < match; j++) ops.push({ op: "del", o: pendingDel[j] });
      for (const x of lone) ops.push({ op: "add", n: x });
      lone = [];
      ops.push({ op: "pair", o: pendingDel[match], n: a });
      ri = match + 1;
    }
    for (let j = ri; j < pendingDel.length; j++) ops.push({ op: "del", o: pendingDel[j] });
    for (const x of lone) ops.push({ op: "add", n: x });
    pendingDel = [];
  };
  for (const part of parts) {
    const count = part.value.length;
    if (part.removed) {
      pendingDel.push(...olds.slice(oi, oi + count));
      oi += count;
    } else if (part.added) {
      pendingAdd.push(...news.slice(ni, ni + count));
      ni += count;
    } else {
      flushRun();
      for (let k = 0; k < count; k++) ops.push({ op: "same", o: olds[oi + k], n: news[ni + k] });
      oi += count;
      ni += count;
    }
  }
  flushRun();
  return { ops };
}

function blockWords(n: MdNode, src: string): string[] {
  return words(tokenize(slice(n, src)));
}

function pairable(o: MdNode, n: MdNode, oSrc: string, nSrc: string): boolean {
  if (kindOf(o) !== kindOf(n)) return false;
  if (o.type === "code" || o.type === "raw") return false;
  return similarity(blockWords(o, oSrc), blockWords(n, nSrc)) >= 0.3;
}

/* ───────────────────────── 바뀐 블록 표시 ───────────────────────── */

function annotateTable(o: MdNode, n: MdNode, oSrc: string, nSrc: string): string | null {
  const oRows = o.children ?? [];
  const nRows = n.children ?? [];
  const cols = nRows[0]?.children?.length ?? 0;
  if (!cols || (oRows[0]?.children?.length ?? 0) !== cols) return null;
  const cellText = (row: MdNode, src: string) => (row.children ?? []).map((c) => inlineTokens(c, src).join(""));
  const line = (cells: string[]) => `| ${cells.map((c) => c.trim() || " ").join(" | ")} |`;
  const markRow = (tag: "ins" | "del", row: MdNode, src: string) => cellText(row, src).map((c) => wrapInline(tag, c));

  // 머리줄은 언제나 짝
  const head = (nRows[0].children ?? []).map((c, i) => markTokens(inlineTokens(oRows[0].children![i], oSrc), inlineTokens(c, nSrc)));
  const lines = [line(head), `| ${Array.from({ length: cols }, (_, i) => alignCell(n.align?.[i] ?? null)).join(" | ")} |`];

  const { ops } = align(
    oRows.slice(1),
    nRows.slice(1),
    (r, side) => cellText(r, side === "o" ? oSrc : nSrc).join("\u0000"),
    // 같은 자리에서 지워지고 더해진 줄은 칸 안에서 비교하는 편이 읽기 쉽다 (시안 f6-A)
    () => true
  );
  for (const op of ops) {
    if (op.op === "same") lines.push(line(cellText(op.n, nSrc)));
    else if (op.op === "add") lines.push(line(markRow("ins", op.n, nSrc)));
    else if (op.op === "del") {
      if ((op.o.children?.length ?? 0) !== cols) return null;
      lines.push(line(markRow("del", op.o, oSrc)));
    } else {
      if ((op.o.children?.length ?? 0) !== cols) return null;
      lines.push(line((op.n.children ?? []).map((c, i) => markTokens(inlineTokens(op.o.children![i], oSrc), inlineTokens(c, nSrc)))));
    }
  }
  return lines.join("\n");
}

function alignCell(a: string | null): string {
  return a === "left" ? ":---" : a === "right" ? "---:" : a === "center" ? ":---:" : "---";
}

/** 목록 항목: 첫 문단만 비교하고, 그 밖의 자식(중첩 목록 등)은 같아야 한다 */
function itemParts(item: MdNode, src: string): { para: MdNode; rest: string } | null {
  const kids = item.children ?? [];
  if (kids.length === 0 || kids[0].type !== "paragraph") return null;
  const rest = kids
    .slice(1)
    .map((k) => blockSource(k, src))
    .join("\n\n");
  return { para: kids[0], rest };
}

function annotateList(o: MdNode, n: MdNode, oSrc: string, nSrc: string): string | null {
  if (Boolean(o.ordered) !== Boolean(n.ordered)) return null;
  const start = typeof n.start === "number" ? n.start : 1;
  const out: string[] = [];
  let failed = false;
  const marker = (i: number) => (n.ordered ? `${start + i}.` : "-");
  const check = (it: MdNode) => (it.checked === true ? "[x] " : it.checked === false ? "[ ] " : "");
  const indentRest = (rest: string, width: number) =>
    rest
      ? "\n\n" +
        rest
          .split("\n")
          .map((l) => (l ? " ".repeat(width) + l : l))
          .join("\n")
      : "";
  const emit = (it: MdNode, body: string, rest: string) => {
    const m = marker(out.length);
    out.push(`${m} ${check(it)}${keepParagraph(body)}${indentRest(rest, m.length + 1)}`);
  };
  const { ops } = align(
    o.children ?? [],
    n.children ?? [],
    (it, side) => keyOf(it, side === "o" ? oSrc : nSrc).replace(/^(?:[-*+]|\d+[.)])\s*/, ""),
    (a, b) => pairable({ ...a, type: "p" }, { ...b, type: "p" }, oSrc, nSrc)
  );
  for (const op of ops) {
    if (failed) break;
    if (op.op === "same") {
      const p = itemParts(op.n, nSrc);
      if (!p) {
        failed = true;
        break;
      }
      emit(op.n, inlineTokens(p.para, nSrc).join(""), p.rest);
    } else if (op.op === "add" || op.op === "del") {
      const it = op.op === "add" ? op.n : op.o;
      const src = op.op === "add" ? nSrc : oSrc;
      const p = itemParts(it, src);
      if (!p || p.rest) {
        failed = true;
        break;
      }
      emit(it, wrapInline(op.op === "add" ? "ins" : "del", inlineTokens(p.para, src).join("")), "");
    } else {
      const po = itemParts(op.o, oSrc);
      const pn = itemParts(op.n, nSrc);
      if (!po || !pn || po.rest.trim() !== pn.rest.trim()) {
        failed = true;
        break;
      }
      emit(op.n, annotateInline(po.para, pn.para, oSrc, nSrc), pn.rest);
    }
  }
  return failed ? null : out.join("\n");
}

function annotateJsx(o: MdNode, n: MdNode, oSrc: string, nSrc: string): string | null {
  const ok = o.children ?? [];
  const nk = n.children ?? [];
  if (ok.length === 0 || nk.length === 0) return null;
  const open = (x: MdNode, kids: MdNode[], src: string) => src.slice(off(x)[0], off(kids[0])[0]);
  const close = (x: MdNode, kids: MdNode[], src: string) => src.slice(off(kids[kids.length - 1])[1], off(x)[1]);
  if (open(o, ok, oSrc).trim() !== open(n, nk, nSrc).trim()) return null;
  if (close(o, ok, oSrc).trim() !== close(n, nk, nSrc).trim()) return null;
  const inline = (kids: MdNode[]) => kids.every((k) => PHRASING.has(k.type));
  if (inline(ok) && inline(nk)) {
    return (
      open(n, nk, nSrc).trimEnd() +
      markTokens(inlineTokens({ type: "x", children: ok }, oSrc), inlineTokens({ type: "x", children: nk }, nSrc)) +
      close(n, nk, nSrc).trimStart()
    );
  }
  if (inline(ok) || inline(nk)) return null;
  return `${open(n, nk, nSrc).trim()}\n\n${annotateChildren(ok, nk, oSrc, nSrc)}\n\n${close(n, nk, nSrc).trim()}`;
}

function annotateQuote(o: MdNode, n: MdNode, oSrc: string, nSrc: string): string {
  return annotateChildren(o.children ?? [], n.children ?? [], oSrc, nSrc)
    .split("\n")
    .map((l) => (l ? `> ${l}` : ">"))
    .join("\n");
}

function annotateBlock(o: MdNode, n: MdNode, oSrc: string, nSrc: string): string | null {
  switch (n.type) {
    case "paragraph":
      return keepParagraph(annotateInline(o, n, oSrc, nSrc));
    case "heading":
      return `${"#".repeat(n.depth ?? 2)} ${annotateInline(o, n, oSrc, nSrc)}`;
    case "table":
      return annotateTable(o, n, oSrc, nSrc);
    case "list":
      return annotateList(o, n, oSrc, nSrc);
    case "blockquote":
      return annotateQuote(o, n, oSrc, nSrc);
    case "mdxJsxFlowElement":
      return annotateJsx(o, n, oSrc, nSrc);
    default:
      return null;
  }
}

/** JSX·인용 안의 자식 블록 비교 결과를 MDX 한 덩어리로 (더함/지움은 div 로 감싼다) */
function annotateChildren(ok: MdNode[], nk: MdNode[], oSrc: string, nSrc: string): string {
  const box = (cls: string, s: string) => `<div className="diff-blk ${cls}">\n\n${s}\n\n</div>`;
  const out: string[] = [];
  for (const op of alignBlocks(ok, nk, oSrc, nSrc).ops) {
    if (op.op === "same") out.push(blockSource(op.n, nSrc));
    else if (op.op === "add") out.push(box("diff-blk-add", blockSource(op.n, nSrc)));
    else if (op.op === "del") out.push(box("diff-blk-del", blockSource(op.o, oSrc)));
    else {
      const a = annotateBlock(op.o, op.n, oSrc, nSrc);
      if (a !== null) out.push(a);
      else out.push(box("diff-blk-del", blockSource(op.o, oSrc)), box("diff-blk-add", blockSource(op.n, nSrc)));
    }
  }
  return out.join("\n\n");
}

function alignBlocks(ok: MdNode[], nk: MdNode[], oSrc: string, nSrc: string) {
  return align(
    ok,
    nk,
    (b, side) => keyOf(b, side === "o" ? oSrc : nSrc),
    (a, b) => pairable(a, b, oSrc, nSrc)
  );
}

/* ───────────────────────── 바깥 진입점 ───────────────────────── */

/**
 * 예전 본문 → 지금 본문의 비교 조각들. 지금 문서 순서대로 나오고, 지운 블록은
 * 원래 있던 자리(뒤따르던 블록 앞)에 끼어 있다. 바뀌지 않은 블록은 이어 붙여 한 조각으로.
 */
export function blockDiff(oldBody: string, newBody: string): DiffChunk[] {
  const nBlocks = parseBlocks(newBody) ?? roughBlocks(newBody);
  const oBlocks = parseBlocks(oldBody) ?? roughBlocks(oldBody);
  const chunks: DiffChunk[] = [];
  let sameRun: MdNode[] = [];
  const flushSame = () => {
    if (sameRun.length === 0) return;
    const a = off(sameRun[0])[0];
    const b = off(sameRun[sameRun.length - 1])[1];
    chunks.push({ kind: "same", source: newBody.slice(a, b) });
    sameRun = [];
  };
  for (const op of alignBlocks(oBlocks, nBlocks, oldBody, newBody).ops) {
    if (op.op === "same") {
      sameRun.push(op.n);
      continue;
    }
    flushSame();
    if (op.op === "add") chunks.push({ kind: "added", source: blockSource(op.n, newBody) });
    else if (op.op === "del") chunks.push({ kind: "removed", source: blockSource(op.o, oldBody) });
    else {
      const oldSource = blockSource(op.o, oldBody);
      const newSource = blockSource(op.n, newBody);
      const a = annotateBlock(op.o, op.n, oldBody, newBody);
      if (a === null) {
        chunks.push({ kind: "removed", source: oldSource }, { kind: "added", source: newSource });
      } else {
        chunks.push({ kind: "changed", source: a, oldSource, newSource });
      }
    }
  }
  flushSame();
  return chunks;
}

/** 줄 수 기준 대략의 더함/지움 (배너·요약용) */
export function chunkStats(chunks: DiffChunk[]): { added: number; removed: number; changed: number } {
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const c of chunks) {
    if (c.kind === "added") added++;
    else if (c.kind === "removed") removed++;
    else if (c.kind === "changed") changed++;
  }
  return { added, removed, changed };
}
