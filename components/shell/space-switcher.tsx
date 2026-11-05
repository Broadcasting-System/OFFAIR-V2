"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/logo";
import { LockIcon, SwapIcon } from "./icons";
import { SPACE_LABEL, type SpaceKey } from "@/lib/wiki/links";

/**
 * 서랍 맨 위 공간 스위처 (시안 f8-D). 가이드북(공개) ↔ 부원 공간(부원만).
 * 부원 공간을 고르면 /members 로 간다 — 손님이면 그곳에서 로그인 벽이 나온다.
 */
export function SpaceSwitcher({ space, count }: { space: SpaceKey; count: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(s: SpaceKey) {
    setOpen(false);
    router.push(s === "guide" ? "/" : "/members");
  }

  const sub = `${space === "guide" ? "공개" : "부원만"}${count !== null ? ` · 문서 ${count}` : ""}`;

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`공간: ${SPACE_LABEL[space]} (바꾸기)`}
        className="flex w-full items-center gap-2.5 rounded-lg border border-line px-2 py-[7px] text-left transition-colors hover:bg-hover"
      >
        <SpaceMark space={space} />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[13.5px] font-bold text-fg">{SPACE_LABEL[space]}</b>
          <small className="block truncate text-[11.5px] text-fg-3">{sub}</small>
        </span>
        <SwapIcon size={15} className="text-fg-3" />
      </button>
      {open && (
        <div role="menu" aria-label="공간 고르기" className="pop-menu absolute top-[calc(100%+6px)] right-0 left-0 z-50">
          {(["guide", "members"] as SpaceKey[]).map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === space}
              onClick={() => go(s)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13.5px] text-fg-2 hover:bg-hover ${s === space ? "bg-hover font-semibold text-fg" : ""}`}
            >
              <SpaceMark space={s} small />
              <span className="flex-1">{SPACE_LABEL[s]}</span>
              {s === "guide" ? (
                <span className="text-[12px] text-fg-3">공개</span>
              ) : (
                <span className="inline-flex items-center gap-0.5 rounded bg-lock-bg px-1.5 text-[11px] font-semibold text-lock">
                  <LockIcon size={10} />
                  부원만
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 공간 네모: 가이드북 = OFFAIR 글자 로고(레일과 같은 LogoMark), 부원 공간 = 보라 자물쇠 */
export function SpaceMark({ space, small = false }: { space: SpaceKey; small?: boolean }) {
  const size = small ? "size-7 rounded-md" : "size-[30px] rounded-[7px]";
  if (space === "guide") {
    return (
      <span aria-hidden className={`grid flex-none place-items-center border border-line bg-bg ${size} ${small ? "scale-90" : ""}`}>
        <LogoMark />
      </span>
    );
  }
  return (
    <span aria-hidden className={`grid flex-none place-items-center bg-lock text-lock-fg ${size}`}>
      <LockIcon size={small ? 13 : 15} />
    </span>
  );
}
