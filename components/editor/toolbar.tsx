"use client";

/**
 * 아래 떠 있는 도구 막대 — 시안 editor-toolbar.html 의 동작을 그대로 옮겼다.
 *
 *  - 문서를 열 때마다 점에서 막대로 펼침 (Web Animations API)
 *  - 폭이 바뀌면 배경이 따라 늘고 줄기 (ResizeObserver)
 *  - 파란 판은 '모드'(댓글 모드)에만. 처음 놓일 땐 움직임 없이
 *  - 본문/H1/H2/H3 회색 세그먼트 + 지금 줄을 따라 미끄러지는 흰 판
 *  - 큰 버튼 + 좁은 ▾ (하위 메뉴), 목록·상자 묶음은 마지막에 고른 것을 따라감
 *  - 실행 취소/다시 실행 아이콘 ∓28° 회전, 누를 때 scale(.94), 툴팁 10px 위
 *  - mousedown 기본 동작을 막아 편집 중인 글의 포커스·선택을 뺏지 않는다
 *  - prefers-reduced-motion 이면 움직임 없음
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { DarkMenu, reduceMotion, type MenuEntry, type MenuItem } from "./dark-menu";

export type BlockKind = "p" | "h1" | "h2" | "h3";
export type ListKind = "bullet" | "number" | "todo";
export type BoxKind = "warn" | "info" | "tip";

const EASE = "cubic-bezier(.16,1,.3,1)";

const LISTS: [ListKind, string, string][] = [
  ["bullet", "글머리 기호", "⇧⌘8"],
  ["number", "번호 목록", "⇧⌘7"],
  ["todo", "할 일 목록", "⇧⌘9"],
];
const BOXES: [BoxKind, string][] = [
  ["warn", "주의 상자"],
  ["info", "정보 상자"],
  ["tip", "팁 상자"],
];
const BLOCKS: [BlockKind, string, string, string][] = [
  ["p", "본문", "본문", "⌥⌘0"],
  ["h1", "H1", "큰 제목", "⌥⌘1"],
  ["h2", "H2", "중간 제목", "⌥⌘2"],
  ["h3", "H3", "작은 제목", "⌥⌘3"],
];

export interface ToolbarActions {
  undo(): void;
  redo(): void;
  setBlock(k: BlockKind): void;
  toggleList(k: ListKind): void;
  insertBox(k: BoxKind): void;
  insertTable(rows: number, cols: number, header: boolean): void;
  tableOp(op: string): void;
  insertImage(how: "file" | "library" | "url"): void;
  insertSteps(): void;
  more(key: string): void;
  toggleComment(): void;
}

export interface ToolbarState {
  block: BlockKind | null;
  canUndo: boolean;
  canRedo: boolean;
  inTable: boolean;
  activeList: ListKind | null;
  commentMode: boolean;
}

export interface ToolbarHandle {
  spin(kind: "undo" | "redo"): void;
  el: HTMLDivElement | null;
}

interface Props {
  state: ToolbarState;
  actions: ToolbarActions;
  /** 메뉴를 놓을 기준 상자(스크롤하지 않는 편집 영역) */
  work: React.RefObject<HTMLElement | null>;
  /** 바뀔 때마다 펼침을 다시 한다 (문서 열 때) */
  unfoldKey: string;
}

interface OpenMenu {
  id: string;
  anchor: HTMLElement;
  entries: MenuEntry[];
  onPick: (it: MenuItem) => void;
}

export const Toolbar = forwardRef<ToolbarHandle, Props>(function Toolbar({ state, actions, work, unfoldKey }, ref) {
  const tbRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLSpanElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const segRef = useRef<HTMLDivElement>(null);
  const spillRef = useRef<HTMLSpanElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const redoRef = useRef<HTMLButtonElement>(null);
  const listIcon = useRef<HTMLSpanElement>(null);
  const boxIcon = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState<{ list: ListKind; box: BoxKind }>({ list: "bullet", box: "warn" });
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const cur: BlockKind = state.block ?? "p";

  /* ── 실행 취소 회전 ── */
  const spin = useCallback((kind: "undo" | "redo") => {
    const svg = (kind === "undo" ? undoRef : redoRef).current?.querySelector("svg");
    if (!svg || reduceMotion()) return;
    const deg = kind === "undo" ? -28 : 28;
    svg.animate(
      [
        { transform: "rotate(0)" },
        { transform: `rotate(${deg}deg)`, easing: "ease-out" },
        { transform: "rotate(0)", easing: "ease-in-out" },
      ],
      { duration: 200 },
    );
  }, []);
  useImperativeHandle(ref, () => ({ spin, get el() { return tbRef.current; } }), [spin]);

  /* ── 파란 판(모드) ── */
  const pillShown = useRef(false);
  const placePill = useCallback(() => {
    const tb = tbRef.current;
    const pill = pillRef.current;
    if (!tb || !pill) return;
    const on = tb.querySelector<HTMLElement>(":scope > button.on");
    if (!on) {
      pill.style.opacity = "0";
      pillShown.current = false;
      return;
    }
    if (!pillShown.current) pill.classList.add("instant");
    Object.assign(pill.style, {
      left: on.offsetLeft + "px",
      top: on.offsetTop + "px",
      width: on.offsetWidth + "px",
      height: on.offsetHeight + "px",
      opacity: "1",
    });
    if (!pillShown.current) {
      void pill.offsetWidth;
      pill.classList.remove("instant");
      pillShown.current = true;
    }
  }, []);

  /* ── 세그먼트 흰 판 ── */
  const segPlaced = useRef(false);
  const placeSegPill = useCallback(() => {
    const seg = segRef.current;
    const sp = spillRef.current;
    if (!seg || !sp) return;
    const btn = seg.querySelector<HTMLElement>("button.cur") ?? seg.querySelector<HTMLElement>("button");
    if (!btn || !btn.offsetWidth) return;
    if (!segPlaced.current) sp.classList.add("instant");
    sp.style.left = btn.offsetLeft + "px";
    sp.style.width = btn.offsetWidth + "px";
    if (!segPlaced.current) {
      void sp.offsetWidth;
      sp.classList.remove("instant");
      segPlaced.current = true;
    }
  }, []);
  useLayoutEffect(placeSegPill, [cur, placeSegPill]);
  useLayoutEffect(placePill, [state.commentMode, placePill]);
  useEffect(() => {
    const tb = tbRef.current;
    if (!tb) return;
    const mo = new MutationObserver(placePill);
    mo.observe(tb, { subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [placePill]);

  /* ── 폭이 바뀌면 배경이 따라 늘고 줄기 ── */
  useEffect(() => {
    const tb = tbRef.current;
    if (!tb) return;
    let lastW = 0;
    const ro = new ResizeObserver(() => {
      const W = tb.offsetWidth;
      placePill();
      placeSegPill();
      if (lastW && Math.abs(W - lastW) > 2 && !reduceMotion() && bgRef.current) {
        const d = (W - lastW) / 2;
        bgRef.current.animate([{ left: d + "px", right: d + "px" }, { left: "0px", right: "0px" }], { duration: 450, easing: EASE });
        if (d > 0) {
          tb.animate(
            [{ clipPath: `inset(-40px ${d}px -40px ${d}px round 14px)` }, { clipPath: "inset(-40px 0px -40px 0px round 14px)" }],
            { duration: 450, easing: EASE },
          );
        }
      }
      lastW = W;
    });
    ro.observe(tb);
    return () => ro.disconnect();
  }, [placePill, placeSegPill]);

  /* ── 점에서 막대로 펼침 — 문서를 열 때마다 ── */
  useLayoutEffect(() => {
    const tb = tbRef.current;
    if (!tb) return;
    const unfold = () => {
      if (!tbRef.current) return;
      if (reduceMotion()) {
        tb.style.opacity = "1";
        return;
      }
      const W = tb.offsetWidth;
      const x = Math.max(0, (W - 44) / 2);
      tb.style.opacity = "";
      tb.animate([{ opacity: 0, translate: "0 10px" }, { opacity: 1, translate: "0 0" }], { duration: 250, easing: EASE, fill: "backwards" });
      bgRef.current?.animate([{ left: x + "px", right: x + "px" }, { left: "0px", right: "0px" }], { delay: 260, duration: 520, easing: EASE, fill: "backwards" });
      tb.animate(
        [{ clipPath: `inset(-40px ${x}px -40px ${x}px round 14px)` }, { clipPath: "inset(-40px 0px -40px 0px round 14px)" }],
        { delay: 260, duration: 520, easing: EASE, fill: "backwards" },
      );
      const kids = Array.from(tb.querySelectorAll<HTMLElement>(":scope > button, :scope > .we-seg, :scope > .we-tb-div")).filter((k) => k.offsetWidth > 0);
      const mid = W / 2;
      kids
        .map((k) => [k, Math.abs(k.offsetLeft + k.offsetWidth / 2 - mid)] as const)
        .sort((a, b) => a[1] - b[1])
        .forEach(([k], i) =>
          // 끝 불투명도는 지금 값(흐린 버튼은 .35)으로 — 펼친 직후 '툭' 바뀌지 않게
          k.animate([{ opacity: 0, translate: "0 3px" }, { opacity: getComputedStyle(k).opacity, translate: "0 0" }], {
            delay: 420 + i * 30,
            duration: 300,
            easing: EASE,
            fill: "backwards",
          }),
        );
    };
    // 첫 크기를 잰 뒤 숨겨 두었다가, 한가할 때 펼친다
    tb.style.opacity = "0";
    let idle: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const go = () => requestAnimationFrame(unfold);
    if ("requestIdleCallback" in window) idle = window.requestIdleCallback(go, { timeout: 600 });
    else timer = setTimeout(go, 200);
    return () => {
      if (idle != null) window.cancelIdleCallback(idle);
      if (timer) clearTimeout(timer);
      tb.style.opacity = "1";
    };
  }, [unfoldKey]);

  /* ── 따라가는 묶음: 아이콘 바뀔 때 살짝 ── */
  const popIcon = (el: HTMLElement | null) => {
    if (!el || reduceMotion()) return;
    el.animate([{ opacity: 0, transform: "scale(.7)" }, { opacity: 1, transform: "none" }], { duration: 100 });
  };
  const seenList = useRef(follow.list);
  const seenBox = useRef(follow.box);
  useEffect(() => {
    if (seenList.current !== follow.list) popIcon(listIcon.current);
    if (seenBox.current !== follow.box) popIcon(boxIcon.current);
    seenList.current = follow.list;
    seenBox.current = follow.box;
  }, [follow]);

  /* ── 하위 메뉴 ── */
  const closeMenu = useCallback(() => {
    setMenu(null);
    setMenuPos(null);
  }, []);
  const openMenu = (id: string, anchor: HTMLElement, entries: MenuEntry[], onPick: (it: MenuItem) => void) => {
    if (menu?.id === id) return closeMenu();
    const w = work.current;
    if (!w) return;
    const wr = w.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    setMenu({ id, anchor, entries, onPick });
    setMenuPos({ left: Math.max(8, ar.left - wr.left - 8), bottom: wr.bottom - ar.top + 12 });
  };
  // 오른쪽 끝을 넘으면 안쪽으로
  useLayoutEffect(() => {
    const el = menuRef.current;
    const w = work.current;
    if (!el || !w || !menuPos) return;
    const maxLeft = w.clientWidth - el.offsetWidth - 8;
    if (menuPos.left > maxLeft) setMenuPos({ ...menuPos, left: Math.max(8, maxLeft) });
  }, [menuPos, work]);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (menuRef.current?.contains(t) || t.closest?.("[aria-haspopup]") === menu.anchor) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMenu();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menu, closeMenu]);

  const pick = (fn: (it: MenuItem) => void) => (it: MenuItem) => {
    closeMenu();
    fn(it);
  };

  const L = LISTS.find((x) => x[0] === follow.list)!;
  const B = BOXES.find((x) => x[0] === follow.box)!;
  const blockLabel = BLOCKS.find((b) => b[0] === cur)![1];

  return (
    <>
      <div
        ref={tbRef}
        className="we-tb"
        role="toolbar"
        aria-label="편집 도구"
        onMouseDown={(e) => {
          if (!(e.target as HTMLElement).closest("input,textarea")) e.preventDefault();
        }}
      >
        <span className="we-tb-bg" ref={bgRef} />
        <span className="we-tb-pill" ref={pillRef} />

        <button ref={undoRef} type="button" aria-label="실행 취소" data-tip="실행 취소  ⌘Z" disabled={!state.canUndo} onClick={() => { actions.undo(); spin("undo"); }}>
          <Icon name="undo" />
        </button>
        <button ref={redoRef} type="button" className="narrow-hide" aria-label="다시 실행" data-tip="다시 실행  ⇧⌘Z" disabled={!state.canRedo} onClick={() => { actions.redo(); spin("redo"); }}>
          <Icon name="redo" />
        </button>
        <span className="we-tb-div" />

        <div className="we-seg" ref={segRef} role="group" aria-label="문단 종류">
          <span className="we-seg-pill" ref={spillRef} />
          {BLOCKS.map(([k, label, name, kbd]) => (
            <button key={k} type="button" className={cur === k ? "cur" : ""} aria-label={name} aria-pressed={cur === k} data-tip={`${name}  ${kbd}`} onClick={() => actions.setBlock(k)}>
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="we-tb-block"
          aria-label="문단 종류"
          aria-haspopup="menu"
          aria-expanded={menu?.id === "block"}
          onClick={(e) =>
            openMenu(
              "block",
              e.currentTarget,
              BLOCKS.map(([k, , name, kbd]) => ({ key: k, name, kbd, icon: k === "p" ? "text" : k, check: k === cur })),
              pick((it) => actions.setBlock(it.key as BlockKind)),
            )
          }
        >
          {blockLabel} <Icon name="chev" size={12} />
        </button>
        <span className="we-tb-div" />

        <button type="button" aria-label={L[1]} data-tip={`${L[1]}  ${L[2]}`} aria-pressed={state.activeList === follow.list} onClick={() => actions.toggleList(follow.list)}>
          <span className="we-ic-wrap" ref={listIcon}><Icon name={L[0]} /></span>
        </button>
        <button
          type="button"
          className="drop"
          aria-label="목록 더 보기"
          aria-haspopup="menu"
          aria-expanded={menu?.id === "list"}
          onClick={(e) =>
            openMenu(
              "list",
              e.currentTarget,
              LISTS.map(([k, n, kbd]) => ({ key: k, name: n, kbd, icon: k, check: follow.list === k })),
              pick((it) => {
                setFollow((f) => ({ ...f, list: it.key as ListKind }));
                actions.toggleList(it.key as ListKind);
              }),
            )
          }
        >
          <Icon name="chev" size={12} />
        </button>

        <button type="button" aria-label={B[1]} data-tip={B[1]} onClick={() => actions.insertBox(follow.box)}>
          <span className="we-ic-wrap" ref={boxIcon}><Icon name={B[0]} /></span>
        </button>
        <button
          type="button"
          className="drop"
          aria-label="상자 더 보기"
          aria-haspopup="menu"
          aria-expanded={menu?.id === "box"}
          onClick={(e) =>
            openMenu(
              "box",
              e.currentTarget,
              BOXES.map(([k, n]) => ({ key: k, name: n, icon: k, check: follow.box === k })),
              pick((it) => {
                setFollow((f) => ({ ...f, box: it.key as BoxKind }));
                actions.insertBox(it.key as BoxKind);
              }),
            )
          }
        >
          <Icon name="chev" size={12} />
        </button>

        <button type="button" aria-label="표 넣기" data-tip="표 넣기 (3×3)" onClick={() => actions.insertTable(3, 3, true)}>
          <Icon name="table" />
        </button>
        <button
          type="button"
          className="drop"
          aria-label="표 더 보기"
          aria-haspopup="menu"
          aria-expanded={menu?.id === "table"}
          onClick={(e) =>
            openMenu(
              "table",
              e.currentTarget,
              [
                { label: "새 표" },
                { key: "2x2", name: "2 × 2", icon: "table" },
                { key: "3x3", name: "3 × 3 (머리글)", icon: "table" },
                { key: "4x4", name: "4 × 4 (머리글)", icon: "table" },
                { key: "3x3n", name: "머리글 없는 3 × 3", icon: "table" },
                ...(state.inTable
                  ? ([
                      { label: "지금 표" },
                      { key: "rowBefore", name: "위에 줄 넣기", icon: "add" },
                      { key: "rowAfter", name: "아래에 줄 넣기", icon: "add" },
                      { key: "colBefore", name: "왼쪽에 칸 넣기", icon: "add" },
                      { key: "colAfter", name: "오른쪽에 칸 넣기", icon: "add" },
                      { key: "delRow", name: "이 줄 지우기", icon: "trash" },
                      { key: "delCol", name: "이 칸 지우기", icon: "trash" },
                      { key: "delTable", name: "표 지우기", icon: "trash" },
                    ] as MenuEntry[])
                  : []),
              ],
              pick((it) => {
                const sizes: Record<string, [number, number, boolean]> = { "2x2": [2, 2, false], "3x3": [3, 3, true], "4x4": [4, 4, true], "3x3n": [3, 3, false] };
                if (sizes[it.key]) actions.insertTable(...sizes[it.key]);
                else actions.tableOp(it.key);
              }),
            )
          }
        >
          <Icon name="chev" size={12} />
        </button>

        <button type="button" aria-label="이미지 넣기" data-tip="이미지 넣기" onClick={() => actions.insertImage("file")}>
          <Icon name="image" />
        </button>
        <button
          type="button"
          className="drop"
          aria-label="이미지 더 보기"
          aria-haspopup="menu"
          aria-expanded={menu?.id === "image"}
          onClick={(e) =>
            openMenu(
              "image",
              e.currentTarget,
              [
                { key: "file", name: "내 컴퓨터에서", icon: "upload" },
                { key: "library", name: "올린 파일에서 고르기", icon: "file" },
                { key: "url", name: "주소로 넣기", icon: "link" },
              ],
              pick((it) => actions.insertImage(it.key as "file" | "library" | "url")),
            )
          }
        >
          <Icon name="chev" size={12} />
        </button>

        <button type="button" className="narrow-hide" aria-label="단계 넣기" data-tip="단계 넣기" onClick={() => actions.insertSteps()}>
          <Icon name="steps" />
        </button>
        <button
          type="button"
          aria-label="더 넣기"
          data-tip="더 넣기  /"
          aria-haspopup="menu"
          aria-expanded={menu?.id === "more"}
          onClick={(e) =>
            openMenu(
              "more",
              e.currentTarget,
              [
                { label: "블록" },
                { key: "code", name: "코드 블록", icon: "code", kbd: "⌥⌘C" },
                { key: "quote", name: "인용", icon: "quote", kbd: "⇧⌘B" },
                { key: "hr", name: "구분선", icon: "hr", kbd: "---" },
                { key: "cards", name: "카드 묶음", icon: "card" },
                { key: "raw", name: "원문 블록 (MDX)", icon: "raw" },
                { label: "첨부·링크" },
                { key: "file", name: "파일 첨부", icon: "file" },
                { key: "youtube", name: "유튜브 영상", icon: "video" },
                { key: "linkcard", name: "링크 카드", icon: "link" },
                { key: "doclink", name: "다른 문서 링크", icon: "page" },
              ],
              pick((it) => actions.more(it.key)),
            )
          }
        >
          <Icon name="plus" />
        </button>
        <span className="we-tb-div" />
        <button
          type="button"
          className={state.commentMode ? "on" : ""}
          aria-label="댓글 모드"
          aria-pressed={state.commentMode}
          data-tip="댓글 모드  C"
          onClick={() => actions.toggleComment()}
        >
          <Icon name="comment" />
        </button>
      </div>

      {menu && menuPos && (
        <DarkMenu
          ref={menuRef}
          entries={menu.entries}
          onPick={menu.onPick}
          style={{ left: menuPos.left, bottom: menuPos.bottom }}
          className="we-menu--tb"
        />
      )}
    </>
  );
});
