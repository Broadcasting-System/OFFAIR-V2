"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/content";
import { CloseIcon } from "@/components/shell/icons";

/**
 * 스크롤 위치에 맞춰 지금 읽는 제목을 찾는다.
 * 위 막대(52px) 바로 아래 선을 지난 마지막 제목이 "현재".
 */
function useActiveHeading(items: TocItem[]) {
  const [active, setActive] = useState("");

  useEffect(() => {
    if (items.length === 0) return;
    let frame = 0;
    function update() {
      frame = 0;
      const line = 96;
      let current = "";
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - line <= 0) current = item.id;
        else break;
      }
      // 맨 끝까지 내렸으면 마지막 제목
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2
      ) {
        current = items[items.length - 1].id;
      }
      setActive(current || items[0].id);
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  return active;
}

function TocList({
  items,
  active,
  onPick,
}: {
  items: TocItem[];
  active: string;
  onPick?: () => void;
}) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const on = active === item.id;
        return (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={onPick}
              aria-current={on ? "location" : undefined}
              className={`block border-l-2 py-[5px] text-[13px] leading-snug transition-colors ${
                item.level === 3 ? "pl-6" : "pl-3"
              } ${
                on
                  ? "border-accent font-semibold text-accent"
                  : "border-line-2 text-fg-2 hover:text-fg"
              }`}
            >
              {item.text}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** 데스크톱: 오른쪽 위에 떠 있는 목차 카드 (열림 여부는 html[data-toc]). */
export function TocCard({ items }: { items: TocItem[] }) {
  const active = useActiveHeading(items);
  if (items.length === 0) return null;
  return (
    <nav
      id="page-toc"
      aria-label="이 페이지의 목차"
      className="toc-card rounded-xl border border-line bg-bg px-3.5 py-3 shadow-pop"
    >
      <p className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-fg-3">
        이 페이지
      </p>
      <TocList items={items} active={active} />
    </nav>
  );
}

/** 모바일: 아래에서 올라오는 목차 시트. */
export function TocSheet({
  items,
  open,
  onClose,
}: {
  items: TocItem[];
  open: boolean;
  onClose: () => void;
}) {
  const active = useActiveHeading(items);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className="shell-scrim min-[769px]:hidden"
        data-open={open}
        onClick={onClose}
        aria-hidden
      />
      <div
        className="toc-sheet"
        data-open={open}
        role="dialog"
        aria-modal={open}
        aria-label="이 페이지의 목차"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" aria-hidden />
        <div className="mb-2 flex items-center">
          <p className="text-[13px] font-semibold text-fg-3">이 페이지</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="목차 닫기"
            className="ml-auto grid size-8 place-items-center rounded-md text-fg-2 hover:bg-hover"
          >
            <CloseIcon />
          </button>
        </div>
        <TocList items={items} active={active} onPick={onClose} />
      </div>
    </>
  );
}
