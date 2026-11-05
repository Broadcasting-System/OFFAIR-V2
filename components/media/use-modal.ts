"use client";

import { useEffect, useSyncExternalStore, type RefObject } from "react";

const noopSubscribe = () => () => {};

/** 브라우저에서 그려질 때만 true (서버·하이드레이션 중엔 false) — 포털을 안전하게 띄우려고 */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 모달 공통: 열릴 때 안쪽으로 초점, Tab 은 안에서만 돌고, 닫히면 원래 자리로 초점,
 * 뒤 페이지 스크롤 잠금.
 */
export function useModal(ref: RefObject<HTMLElement | null>, active: boolean, initialFocus?: string) {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const before = document.activeElement as HTMLElement | null;
    const first =
      (initialFocus ? root.querySelector<HTMLElement>(initialFocus) : null) ??
      root.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? root).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const cur = document.activeElement;
      if (e.shiftKey && (cur === firstEl || !root.contains(cur))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (cur === lastEl || !root.contains(cur))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    root.addEventListener("keydown", onKey);

    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";

    return () => {
      root.removeEventListener("keydown", onKey);
      html.style.overflow = prevOverflow;
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [ref, active, initialFocus]);
}
