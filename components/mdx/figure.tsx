"use client";

import Image from "next/image";
import { useState } from "react";

interface FigureProps {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
  /** disable click-to-zoom */
  static?: boolean;
}

/**
 * Image-control block for the guide book.
 * Renders a framed, captioned figure with click-to-zoom lightbox.
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
  const [open, setOpen] = useState(false);

  return (
    <figure className="my-7">
      <div className="hud-frame overflow-hidden rounded-lg border border-line bg-ink-900 p-1.5">
        <button
          type="button"
          onClick={() => !noZoom && setOpen(true)}
          className={`block w-full overflow-hidden rounded ${
            noZoom ? "cursor-default" : "cursor-zoom-in"
          }`}
          aria-label={noZoom ? alt : `${alt} 확대`}
        >
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            className="h-auto w-full"
            sizes="(max-width: 768px) 100vw, 760px"
          />
        </button>
      </div>
      {caption && (
        <figcaption className="mt-3 flex items-center gap-2 text-sm text-fg-muted">
          <span className="font-mono text-xs uppercase tracking-wider text-beam-400">
            FIG
          </span>
          {caption}
        </figcaption>
      )}

      {open && !noZoom && (
        <div
          role="dialog"
          aria-modal
          aria-label={`${alt} 확대 보기`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/90 p-4 backdrop-blur-sm animate-[fadeIn_.15s_ease]"
        >
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            className="max-h-[90vh] w-auto rounded-lg border border-line-strong shadow-glow"
          />
        </div>
      )}
    </figure>
  );
}
