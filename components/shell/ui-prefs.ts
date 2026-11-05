"use client";

import { useSyncExternalStore } from "react";

/**
 * 화면 설정(테마 · 문서 트리 서랍 · 목차 카드) 저장소.
 *
 * 실제 상태는 <html> 의 data-* 속성이다. 첫 칠하기 전에 app/layout.tsx 의
 * 인라인 스크립트(PREFS_SCRIPT)가 localStorage 를 읽어 속성을 붙이고,
 * CSS 가 그 속성으로 보이기/숨기기를 한다. React 쪽은 버튼 모양·aria 값만
 * useSyncExternalStore 로 따라간다 → 깜빡임도, 하이드레이션 오류도 없다.
 */

import { PANEL_ATTR, PANEL_KEY, THEME_KEY, type Panel } from "./prefs-script";

export type { Panel };
export type Theme = "light" | "dark";

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function save(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* 사생활 보호 모드 등 — 저장만 못 할 뿐 화면은 바뀐다 */
  }
}

/* ───────────── 서랍 / 목차 ───────────── */

export function isPanelOpen(panel: Panel): boolean {
  return document.documentElement.getAttribute(PANEL_ATTR[panel]) === "open";
}

export function setPanelOpen(panel: Panel, open: boolean) {
  const v = open ? "open" : "closed";
  document.documentElement.setAttribute(PANEL_ATTR[panel], v);
  save(PANEL_KEY[panel], v);
  emit();
}

export function togglePanel(panel: Panel) {
  setPanelOpen(panel, !isPanelOpen(panel));
}

export function usePanelOpen(panel: Panel): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isPanelOpen(panel),
    () => false
  );
}

/* ───────────── 테마 ───────────── */

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function getTheme(): Theme {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "dark" || t === "light" ? t : systemTheme();
}

/**
 * 밝게 ↔ 어둡게 전환. 바꾼 결과가 기기 설정과 같으면 저장을 지워서
 * 다시 "기기 따라가기" 상태로 돌아간다.
 */
export function toggleTheme() {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  const root = document.documentElement;
  if (next === systemTheme()) {
    root.removeAttribute("data-theme");
    save(THEME_KEY, null);
  } else {
    root.setAttribute("data-theme", next);
    save(THEME_KEY, next);
  }
  emit();
}

function subscribeTheme(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  const off = subscribe(cb);
  return () => {
    mq.removeEventListener("change", cb);
    off();
  };
}

export function useTheme(): Theme | null {
  return useSyncExternalStore<Theme | null>(subscribeTheme, getTheme, () => null);
}

/* ───────────── 검색 창 열기 (어디서든) ───────────── */

export const OPEN_SEARCH_EVENT = "offair:open-search";

export function openSearch() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

/** 모바일(≤768px) 여부 — 클릭 순간에만 확인한다. */
export function isMobileViewport() {
  return window.matchMedia("(max-width: 768px)").matches;
}
