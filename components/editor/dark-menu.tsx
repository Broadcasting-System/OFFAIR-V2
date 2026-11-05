"use client";

/**
 * 어두운 하위 메뉴 (#1E1E1E) — 도구 막대 ▾, `/` 블록 메뉴, 상자 종류 바꾸기에 같이 쓴다.
 * 항목 13px, 고르면 #2B66D9, 오른쪽에 단축키. 열 때만 살짝 떠오르고 닫을 땐 바로 사라진다.
 */
import { forwardRef, useLayoutEffect, useRef } from "react";
import { Icon } from "./icons";

export interface MenuItem {
  key: string;
  name: string;
  icon?: string;
  kbd?: string;
  desc?: string;
  /** undefined 면 체크 칸 없음, true/false 면 체크 표시 칸 */
  check?: boolean;
  disabled?: boolean;
}
export type MenuEntry = MenuItem | { label: string };

export const isItem = (e: MenuEntry): e is MenuItem => "key" in e;

interface Props {
  entries: MenuEntry[];
  onPick: (item: MenuItem) => void;
  /** 키보드로 고른 항목(슬래시 메뉴) */
  activeKey?: string | null;
  onHover?: (key: string) => void;
  style?: React.CSSProperties;
  className?: string;
  ariaLabel?: string;
}

export const reduceMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const DarkMenu = forwardRef<HTMLDivElement, Props>(function DarkMenu(
  { entries, onPick, activeKey, onHover, style, className, ariaLabel },
  ref,
) {
  const inner = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || reduceMotion()) return;
    el.animate(
      [
        { opacity: 0, transform: "translateY(4px) scale(.96)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 120, easing: "cubic-bezier(.16,1,.3,1)" },
    );
  }, []);
  useLayoutEffect(() => {
    if (!activeKey || !inner.current) return;
    const el = inner.current.querySelector<HTMLElement>(`[data-key="${CSS.escape(activeKey)}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeKey]);

  return (
    <div
      ref={(el) => {
        inner.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      className={`we-menu ${className ?? ""}`}
      role="menu"
      aria-label={ariaLabel}
      style={style}
      onMouseDown={(e) => e.preventDefault()}
    >
      {entries.map((e, i) =>
        isItem(e) ? (
          <div
            key={e.key}
            data-key={e.key}
            role="menuitem"
            aria-disabled={e.disabled || undefined}
            className={`we-menu-it${activeKey === e.key ? " is-active" : ""}${e.disabled ? " is-disabled" : ""}`}
            onMouseEnter={() => onHover?.(e.key)}
            onClick={() => !e.disabled && onPick(e)}
          >
            {e.check !== undefined && <span className="we-menu-ck">{e.check && <Icon name="check" size={14} />}</span>}
            {e.icon && <Icon name={e.icon} size={16} />}
            <span className="we-menu-name">
              {e.name}
              {e.desc && <small>{e.desc}</small>}
            </span>
            {e.kbd && <kbd>{e.kbd}</kbd>}
          </div>
        ) : (
          <div key={`l${i}`} className="we-menu-lab">
            {e.label}
          </div>
        ),
      )}
    </div>
  );
});
