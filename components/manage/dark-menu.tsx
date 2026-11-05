"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 어두운 떠 있는 메뉴 (시안 f3-A). 라이트/다크 어느 테마에서나 같은 어두운 모양.
 * 열린 버튼 옆에 붙고, 화면 밖으로 나가면 위·왼쪽으로 뒤집는다.
 * ↑↓ 로 고르고 ↵ 로 실행, Esc·바깥 누르기로 닫는다. 닫히면 연 버튼으로 포커스를 돌려준다.
 */

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  /** 앞에 구분선 */
  separated?: boolean;
  run: () => void;
}

export function DarkMenu({
  anchor,
  items,
  onClose,
  label,
}: {
  anchor: HTMLElement;
  items: MenuItem[];
  onClose: () => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(() => items.findIndex((i) => !i.disabled));

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const el = ref.current;
    const w = el?.offsetWidth ?? 210;
    const h = el?.offsetHeight ?? 260;
    let left = r.right + 6;
    if (left + w > window.innerWidth - 8) left = Math.max(8, r.left - w - 6);
    if (window.innerWidth < 480) left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    let top = window.innerWidth < 480 ? r.bottom + 4 : r.top - 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.focus();
  }, [active, pos]);

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (ref.current?.contains(e.target as Node) || anchor.contains(e.target as Node)) return;
      onClose();
    }
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [anchor, onClose]);

  function close() {
    onClose();
    anchor.focus();
  }

  function move(d: 1 | -1) {
    let i = active;
    for (let n = 0; n < items.length; n++) {
      i = (i + d + items.length) % items.length;
      if (!items[i].disabled) break;
    }
    setActive(i);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      e.preventDefault();
      close();
    }
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      className="fixed z-[130] min-w-[210px] rounded-xl bg-[#1e1e1e] p-1.5 text-white shadow-[0_12px_32px_rgba(0,0,0,0.3)]"
    >
      {items.map((it, i) => (
        <div key={it.label}>
          {it.separated && <hr className="mx-1.5 my-1 border-0 border-t border-white/12" />}
          <button
            type="button"
            role="menuitem"
            data-idx={i}
            disabled={it.disabled}
            title={it.disabled ? it.hint : undefined}
            onMouseEnter={() => !it.disabled && setActive(i)}
            onClick={() => {
              onClose();
              it.run();
            }}
            className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] outline-none ${
              i === active ? "bg-[#2b66d9]" : ""
            } ${it.danger ? (i === active ? "text-white" : "text-[#ff8f84]") : ""} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <span className="grid w-4 place-items-center opacity-90">{it.icon}</span>
            <span className="flex-1">{it.label}</span>
            {it.kbd && <kbd className="text-[11px] text-white/45">{it.kbd}</kbd>}
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
