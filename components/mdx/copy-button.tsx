"use client";

import { useRef, useState } from "react";

/**
 * Wraps a code block's <pre> and adds a copy-to-clipboard button.
 * Reads the rendered text from the DOM, so it works for any highlighted code.
 */
export function CodeBlock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = ref.current?.querySelector("code")?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div className="group relative my-6 overflow-hidden rounded-lg border border-line bg-[#060a12]">
      <div className="flex items-center justify-between border-b border-line/70 bg-ink-800/60 px-4 py-2">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-ink-600" />
          <span className="size-2.5 rounded-full bg-ink-600" />
          <span className="size-2.5 rounded-full bg-ink-600" />
        </div>
        <button
          type="button"
          onClick={copy}
          aria-label="코드 복사"
          className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-fg-muted transition-colors hover:border-beam-500/60 hover:text-beam-200"
        >
          {copied ? (
            <>
              <CheckIcon /> Copied
            </>
          ) : (
            <>
              <CopyIcon /> Copy
            </>
          )}
        </button>
      </div>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 15V5a2 2 0 0 1 2-2h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
