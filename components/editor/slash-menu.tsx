"use client";

/**
 * `/` 블록 메뉴 — 빈 줄의 `+` 버튼도 이 메뉴를 연다.
 * 키보드: ↑↓ 고르기 · Enter 넣기 · Esc 닫기 (실제 키 처리는 extensions.ts 의 SlashStore)
 */
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { DarkMenu, type MenuEntry } from "./dark-menu";
import type { SlashStore } from "./extensions";

export function SlashMenu({ store, paper }: { store: SlashStore; paper: React.RefObject<HTMLElement | null> }) {
  const s = useSyncExternalStore(store.subscribe, store.get, store.get);
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    const el = ref.current;
    const p = paper.current;
    if (!s.open || !el || !p || !s.rect) return;
    const pr = p.getBoundingClientRect();
    const scroller = p.closest(".we-scroll")?.getBoundingClientRect();
    const w = el.offsetWidth;
    const full = el.scrollHeight;
    // 아래(도구 막대 위까지)와 위 공간을 재서 넓은 쪽에, 그 높이에 맞춰 놓는다
    const below = window.innerHeight - s.rect.bottom - 96;
    const above = s.rect.top - (scroller?.top ?? 0) - 12;
    const down = below >= Math.min(full, 240) || below >= above;
    const maxHeight = Math.max(140, Math.min(420, (down ? below : above) - 6));
    const h = Math.min(full, maxHeight);
    const top = down ? s.rect.bottom - pr.top + 6 : s.rect.top - pr.top - h - 6;
    const left = Math.min(Math.max(0, s.rect.left - pr.left - 8), p.clientWidth - w);
    setStyle({ top, left, maxHeight });
  }, [s.open, s.rect, s.items.length, paper]);

  if (!s.open) return null;

  const entries: MenuEntry[] = [];
  let group = "";
  for (const it of s.items) {
    if (it.group !== group) {
      group = it.group;
      entries.push({ label: group });
    }
    entries.push({ key: it.key, name: it.name, icon: it.icon, kbd: it.kbd });
  }
  const active = s.items[s.active]?.key ?? null;

  return (
    <DarkMenu
      ref={ref}
      className="we-menu--slash"
      ariaLabel="블록 넣기"
      entries={entries.length ? entries : [{ label: "맞는 블록이 없어요" }]}
      activeKey={active}
      onHover={(key) => store.setActive(s.items.findIndex((i) => i.key === key))}
      onPick={(it) => {
        const item = s.items.find((i) => i.key === it.key);
        if (item) store.pick(item);
      }}
      style={style}
    />
  );
}
