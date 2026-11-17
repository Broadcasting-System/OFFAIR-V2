"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface FigureProps {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
  /** 클릭 확대 끄기 */
  static?: boolean;
  /** 표시 달기 사이드카 주소 — 편집기가 다시 고칠 때만 쓴다. 읽기 화면에서는 무시 */
  sidecar?: string;
}

/**
 * 캡션이 붙은 그림. 테두리 1px · 8px 둥근 모서리, 캡션은 아래 칸.
 * 누르면 화면 가득 확대(Esc · 바깥 클릭으로 닫기).
 *
 *   <Figure src="/shots/obs.png" alt="OBS 화면" caption="장면 전환 패널" width={1280} height={720} />
 */
export function Figure({
  src,
  alt,
  caption,
  width = 1280,
  height = 720,
  static: noZoom = false,
}: FigureProps) {
  // sidecar 는 일부러 받지 않는다 (편집기 전용 정보)
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [open]);

  const img = (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className="h-auto w-full"
      sizes="(max-width: 768px) 100vw, 780px"
    />
  );

  return (
    <figure className="my-5 overflow-hidden rounded-lg border border-line bg-bg">
      {noZoom ? (
        <div className="block">{img}</div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full cursor-zoom-in"
          aria-label={`${alt} 크게 보기`}
        >
          {img}
        </button>
      )}
      {caption && (
        <figcaption className="border-t border-line px-3 py-2 text-[13px] leading-normal text-fg-3">
          {caption}
        </figcaption>
      )}

      {open && !noZoom && (
        <div
          role="dialog"
          aria-modal
          aria-label={`${alt} 크게 보기`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/80 p-4 sm:p-8"
        >
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="닫기"
            className="absolute top-3 right-3 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            className="h-auto max-h-[90dvh] w-auto max-w-full rounded-lg"
            sizes="100vw"
          />
        </div>
      )}
    </figure>
  );
}
