"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isTypingTarget } from "@/lib/wiki/client";

/**
 * 아래 가운데 어두운 알림 한 줄. "되돌리기" 같은 동작을 하나 달 수 있고,
 * 동작이 있으면 ⌘Z / Ctrl+Z 로도 누를 수 있다(글 칸에 있을 때는 제외).
 * 어디서든 toast({...}) 로 띄운다. <Toaster /> 는 앱 뼈대에 하나만 둔다.
 */

export interface ToastInput {
  message: string;
  action?: { label: string; run: () => unknown | Promise<unknown> };
  tone?: "default" | "error";
  /** 기본 6초, 동작이 있으면 9초 */
  durationMs?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

let current: ToastItem | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(t: ToastInput) {
  current = { ...t, id: ++seq };
  if (timer) clearTimeout(timer);
  timer = setTimeout(dismissToast, t.durationMs ?? (t.action ? 9000 : 6000));
  emit();
}

export function dismissToast() {
  current = null;
  if (timer) clearTimeout(timer);
  timer = null;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function Toaster() {
  const item = useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  );
  const [busy, setBusy] = useState(false);

  async function runAction() {
    if (!item?.action || busy) return;
    setBusy(true);
    try {
      dismissToast();
      await item.action.run();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!item?.action) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !isTypingTarget(e.target)) {
        e.preventDefault();
        void runAction();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-[22px] z-[120] flex justify-center px-4">
      {item && (
        <div
          key={item.id}
          className={`toast-in pointer-events-auto flex max-w-full items-center gap-3.5 rounded-[10px] px-3.5 py-2.5 text-[13px] shadow-[0_8px_24px_rgba(0,0,0,0.25)] ${
            item.tone === "error" ? "bg-[#5d1f1a] text-white" : "bg-[#1e1e1e] text-white"
          }`}
        >
          <span className="min-w-0">{item.message}</span>
          {item.action && (
            <button
              type="button"
              onClick={runAction}
              className="flex-none rounded font-semibold text-[#85b8ff] hover:underline"
            >
              {item.action.label}
              <span className="ml-1.5 hidden font-semibold sm:inline">⌘Z</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
