"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CloseIcon, CommentIcon } from "@/components/shell/icons";
import { locateAnchor } from "@/lib/wiki/anchor";
import { anchorFromRange, offsetsToRange, textMap, type CommentT } from "@/lib/wiki/comments-client";
import { useComments } from "./context";
import { MentionInput } from "./mention-input";
import { ThreadCard } from "./thread";

/**
 * 본문 위의 댓글 층 (시안 f7-B).
 *  - 댓글이 달린 글에 노란 형광펜 + 밑줄 (CSS Custom Highlight, 안 되는 브라우저는 겹친 상자)
 *  - 글을 고르면 "댓글" 단추 → 새 카드에서 쓰기
 *  - 넓은 화면: 오른쪽 여백에 카드를 형광펜 높이에 맞춰 늘어놓고, 고른 카드는 띄워서 선으로 잇는다
 *  - 좁은 화면(본문 칼럼이 1044px 미만): 카드는 아래 시트 목록 + "본문에서 보기"
 * 본문 DOM 은 서버가 그린 그대로 두고 건드리지 않는다 (위치만 읽는다).
 */

const MARGIN_MIN = 1044; // 24 + 700 + 320
const CARD_GAP = 10;
const DRAFT = "draft";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Geo {
  boxes: Record<string, Box[]>;
  lost: string[];
  width: number;
}

const supportsHighlight = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

export function CommentLayer({ children }: { children: React.ReactNode }) {
  const c = useComments();
  const rootRef = useRef<HTMLDivElement>(null);
  const ranges = useRef(new Map<string, Range>());
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [geo, setGeo] = useState<Geo>({ boxes: {}, lost: [], width: 0 });
  const [tops, setTops] = useState<Record<string, number>>({});
  const [selBtn, setSelBtn] = useState<{ x: number; y: number } | null>(null);
  const [paintBoxes, setPaintBoxes] = useState(false);

  const visible = !!c?.visible;
  const inline = c?.inline;
  const draft = c?.draft ?? null;
  const active = c?.active ?? null;
  const wide = !!c?.wide;
  const setWide = c?.setWide;
  const hasMargin = wide && ((inline?.length ?? 0) > 0 || !!draft);

  /* ───────────── 넓이: 여백 카드가 들어갈까 ───────────── */
  useEffect(() => {
    const col = rootRef.current?.closest(".doc-col");
    if (!col || !setWide) return;
    const check = () => setWide((col as HTMLElement).clientWidth >= MARGIN_MIN && !!rootRef.current?.offsetParent);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(col);
    return () => ro.disconnect();
  }, [setWide, visible]);

  useEffect(() => {
    const root = document.documentElement;
    if (hasMargin) root.setAttribute("data-cmt-margin", "on");
    else root.removeAttribute("data-cmt-margin");
    return () => root.removeAttribute("data-cmt-margin");
  }, [hasMargin]);

  /* ───────────── 형광펜 자리 계산 ───────────── */
  const measure = useCallback(() => {
    const root = rootRef.current;
    const prose = root?.querySelector<HTMLElement>(".prose");
    if (!root || !prose || !visible) return;
    const map = textMap(prose);
    const rr = root.getBoundingClientRect();
    const boxes: Record<string, Box[]> = {};
    const lost: string[] = [];
    ranges.current.clear();
    const place = (id: string, anchor: NonNullable<CommentT["anchor"]>) => {
      const loc = locateAnchor(map.text, anchor, map.blockStarts);
      const range = loc && offsetsToRange(map, loc.start, loc.end);
      if (!range) {
        lost.push(id);
        return;
      }
      ranges.current.set(id, range);
      boxes[id] = [...range.getClientRects()]
        .filter((r) => r.width > 0.5)
        .map((r) => ({ x: r.left - rr.left, y: r.top - rr.top, w: r.width, h: r.height }));
    };
    for (const t of inline ?? []) if (t.anchor) place(t.id, t.anchor);
    if (draft) place(DRAFT, draft.anchor);
    setGeo({ boxes, lost, width: rr.width });

    // 칠하기
    if (supportsHighlight()) {
      const all = [...ranges.current.entries()].filter(([id]) => id !== active).map(([, r]) => r);
      CSS.highlights.set("offair-cmt", new Highlight(...all));
      const on = active ? ranges.current.get(active) : undefined;
      if (on) CSS.highlights.set("offair-cmt-on", new Highlight(on));
      else CSS.highlights.delete("offair-cmt-on");
      setPaintBoxes(false);
    } else setPaintBoxes(true);
  }, [visible, inline, draft, active]);

  useLayoutEffect(() => {
    measure();
  }, [measure, hasMargin]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !visible) return;
    let frame = 0;
    const again = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(again);
    ro.observe(root);
    window.addEventListener("resize", again);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", again);
      cancelAnimationFrame(frame);
    };
  }, [measure, visible]);

  useEffect(
    () => () => {
      if (supportsHighlight()) {
        CSS.highlights.delete("offair-cmt");
        CSS.highlights.delete("offair-cmt-on");
      }
    },
    []
  );

  /* ───────────── 여백 카드 늘어놓기 (겹치지 않게, 고른 카드는 제자리) ───────────── */
  const marginIds = [
    ...(draft && geo.boxes[DRAFT] ? [DRAFT] : []),
    ...(inline ?? []).filter((t) => geo.boxes[t.id]).map((t) => t.id),
  ].sort((a, b) => (geo.boxes[a]?.[0]?.y ?? 0) - (geo.boxes[b]?.[0]?.y ?? 0));
  const lostIds = geo.lost.filter((id) => id !== DRAFT);
  const order = [...marginIds, ...lostIds];
  const orderKey = order.join("|");

  useLayoutEffect(() => {
    if (!hasMargin) return;
    const h = (id: string) => cardRefs.current.get(id)?.offsetHeight ?? 80;
    const want = (id: string, i: number) => geo.boxes[id]?.[0]?.y ?? (i > 0 ? Infinity : 0);
    const next: Record<string, number> = {};
    const ids = orderKey ? orderKey.split("|") : [];
    let ai = ids.indexOf(active ?? "");
    if (ai === -1) ai = 0;
    if (ids.length) {
      next[ids[ai]] = Math.max(0, Number.isFinite(want(ids[ai], ai)) ? want(ids[ai], ai) - 8 : 0);
      for (let i = ai - 1; i >= 0; i--) next[ids[i]] = Math.min(want(ids[i], i) - 8, next[ids[i + 1]] - h(ids[i]) - CARD_GAP);
      for (let i = ai + 1; i < ids.length; i++) {
        const w = want(ids[i], i);
        next[ids[i]] = Math.max(Number.isFinite(w) ? w - 8 : 0, next[ids[i - 1]] + h(ids[i - 1]) + CARD_GAP);
      }
      // 위로 밀려 넘친 카드는 다시 아래로
      if (next[ids[0]] < 0) {
        next[ids[0]] = 0;
        for (let i = 1; i < ids.length; i++) next[ids[i]] = Math.max(next[ids[i]], next[ids[i - 1]] + h(ids[i - 1]) + CARD_GAP);
      }
    }
    // 카드 높이(DOM)를 재야 자리를 정할 수 있다 — 바뀐 경우에만 다시 그린다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTops((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [hasMargin, orderKey, active, geo, c?.list]);

  /* ───────────── 글 고르기 → "댓글" 단추 ───────────── */
  const canWrite = !!c?.canWrite;
  useEffect(() => {
    if (!visible || !canWrite) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      const root = rootRef.current;
      const prose = root?.querySelector(".prose");
      const sel = window.getSelection();
      if (!root || !prose || !sel || sel.rangeCount === 0 || sel.isCollapsed) return setSelBtn(null);
      const range = sel.getRangeAt(0);
      if (!prose.contains(range.commonAncestorContainer) || !sel.toString().trim()) return setSelBtn(null);
      const rects = range.getClientRects();
      const last = rects[rects.length - 1];
      if (!last) return setSelBtn(null);
      const rr = root.getBoundingClientRect();
      setSelBtn({ x: Math.min(last.right - rr.left, rr.width - 40), y: last.bottom - rr.top + 6 });
    };
    const onChange = () => {
      if (t) clearTimeout(t);
      t = setTimeout(update, 120);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      if (t) clearTimeout(t);
    };
  }, [visible, canWrite]);

  function startDraft() {
    const prose = rootRef.current?.querySelector<HTMLElement>(".prose");
    const sel = window.getSelection();
    if (!c || !prose || !sel || sel.rangeCount === 0) return;
    const anchor = anchorFromRange(prose, sel.getRangeAt(0));
    if (!anchor) return;
    sel.removeAllRanges();
    setSelBtn(null);
    c.setDraft({ anchor });
    c.setActive(DRAFT);
    if (!c.wide) c.setSheetOpen(true);
  }

  /* ───────────── 형광펜 누르기 ───────────── */
  function onRootClick(e: React.MouseEvent) {
    if (!c || !visible) return;
    if ((e.target as HTMLElement).closest("[data-cmt-ui], a, button")) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const rr = rootRef.current!.getBoundingClientRect();
    const x = e.clientX - rr.left;
    const y = e.clientY - rr.top;
    const hit = Object.entries(geo.boxes).find(([, bs]) => bs.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y - 2 && y <= b.y + b.h + 2));
    if (hit) {
      c.setActive(hit[0]);
      if (!c.wide) c.setSheetOpen(true);
    } else if (c.active && c.active !== DRAFT) c.setActive(null);
  }

  function showInText(id: string) {
    if (!c) return;
    c.setSheetOpen(false);
    c.setActive(id);
    const r = ranges.current.get(id);
    if (r) window.scrollBy({ top: r.getBoundingClientRect().top - 140, behavior: "smooth" });
  }

  const threads = new Map((inline ?? []).map((t) => [t.id, t]));
  const activeBox = active ? geo.boxes[active]?.[0] : undefined;
  const activeTop = active ? tops[active] : undefined;

  const draftCard = c && draft && (
    <div className="cmt-card-on rounded-[10px] border border-[#f5cd47] bg-bg p-3 shadow-[0_8px_24px_rgba(9,30,66,0.16)]" data-cmt-ui>
      <div className="mb-2 rounded-r border-l-[3px] border-[#f5cd47] bg-bg-soft px-2 py-0.5 text-[12.5px] text-fg-2">
        <span className="line-clamp-2">{draft.anchor.quote}</span>
      </div>
      <div className="flex">
        <MentionInput
          people={c.list?.people ?? []}
          placeholder="댓글 남기기… @ 로 부원 부르기"
          compact
          autoFocus
          onCancel={() => {
            c.setDraft(null);
            c.setActive(null);
          }}
          onSubmit={async (body, ms) => {
            const ok = await c.add(body, ms, { anchor: draft.anchor });
            if (ok) c.setDraft(null);
            return ok;
          }}
        />
      </div>
      <button type="button" onClick={() => (c.setDraft(null), c.setActive(null))} className="mt-1.5 text-[12px] text-fg-3 hover:text-fg">
        취소
      </button>
    </div>
  );

  return (
    <div ref={rootRef} className="relative" onClick={onRootClick}>
      {children}

      {visible && paintBoxes && (
        <div aria-hidden className="pointer-events-none absolute inset-0" data-cmt-ui>
          {Object.entries(geo.boxes).flatMap(([id, bs]) =>
            bs.map((b, i) => (
              <span key={`${id}:${i}`} className={`cmt-box ${id === active ? "cmt-box-on" : ""}`} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />
            ))
          )}
        </div>
      )}

      {visible && selBtn && (
        <button
          type="button"
          data-cmt-ui
          onMouseDown={(e) => e.preventDefault()}
          onClick={startDraft}
          className="absolute z-20 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-lg bg-[#1e1e1e] px-3 text-[13px] font-semibold text-white shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
          style={{ left: selBtn.x, top: selBtn.y }}
        >
          <CommentIcon size={15} />
          댓글
        </button>
      )}

      {/* 넓은 화면: 오른쪽 여백 카드 */}
      {visible && hasMargin && (
        <>
          {activeBox && activeTop !== undefined && (
            <svg aria-hidden className="pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1" data-cmt-ui>
              <path
                d={`M ${activeBox.x + activeBox.w} ${activeBox.y + activeBox.h} H ${geo.width + 12} V ${activeTop + 18} H ${geo.width + 24}`}
                fill="none"
                stroke="#f5cd47"
                strokeWidth="1.5"
              />
            </svg>
          )}
          <div className="cmt-margin absolute top-0 w-[290px]" style={{ left: "calc(100% + 24px)" }} data-cmt-ui>
            {order.map((id) => {
              const t = threads.get(id);
              const isDraft = id === DRAFT;
              if (!isDraft && !t) return null;
              return (
                <div
                  key={id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(id, el);
                    else cardRefs.current.delete(id);
                  }}
                  className="absolute right-0 left-0 transition-[top] duration-150"
                  style={{ top: tops[id] ?? geo.boxes[id]?.[0]?.y ?? 0 }}
                >
                  {isDraft ? (
                    draftCard
                  ) : (
                    <ThreadCard thread={t!} active={active === id} lost={geo.lost.includes(id)} showQuote={false} onActivate={() => c!.setActive(id)} />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 좁은 화면: 아래 시트 */}
      {visible && c && !hasMargin && (
        <>
          <div className="cmt-scrim" data-open={c.sheetOpen} onClick={() => c.setSheetOpen(false)} aria-hidden />
          <div className="cmt-sheet" data-open={c.sheetOpen} role="dialog" aria-modal={c.sheetOpen} aria-label="본문에 단 댓글" data-cmt-ui>
            <div className="mb-2 flex items-center gap-2">
              <span className="mx-auto mb-1 block h-1 w-10 rounded-full bg-line" aria-hidden />
            </div>
            <div className="mb-3 flex items-center">
              <h2 className="text-[15px] font-bold text-fg">본문에 단 댓글 {inline?.length ?? 0}</h2>
              <button type="button" onClick={() => c.setSheetOpen(false)} aria-label="닫기" className="ml-auto grid size-8 place-items-center rounded-md text-fg-2 hover:bg-hover">
                <CloseIcon size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              {draft && draftCard}
              {(inline ?? []).map((t) => (
                <ThreadCard
                  key={t.id}
                  thread={t}
                  active={active === t.id}
                  lost={geo.lost.includes(t.id)}
                  showQuote
                  onActivate={() => c.setActive(t.id)}
                  onShowInText={() => showInText(t.id)}
                />
              ))}
              {!draft && (inline?.length ?? 0) === 0 && <p className="py-6 text-center text-[13.5px] text-fg-3">본문에 단 댓글이 없어요. 글을 골라 댓글을 달 수 있어요.</p>}
            </div>
            <button
              type="button"
              onClick={() => {
                c.setSheetOpen(false);
                document.getElementById("comments")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="mt-4 text-[13px] font-medium text-accent hover:underline"
            >
              문서 전체 댓글 보기
            </button>
          </div>
        </>
      )}
    </div>
  );
}
