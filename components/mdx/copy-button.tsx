"use client";

import { useRef, useState } from "react";

/**
 * 코드 블록(<pre>) 감싸개 + 복사 버튼.
 * 렌더된 DOM 의 글자를 읽어 복사하므로 어떤 하이라이트 결과에도 동작한다.
 */
export function CodeBlock({
  children,
  ...props
}: React.HTMLAttributes<HTMLPreElement> & { "data-language"?: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const lang = props["data-language"];

  async function copy() {
    const text = ref.current?.querySelector("code")?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 클립보드 차단 — 아무것도 안 함 */
    }
  }

  return (
    <div className="group relative my-5 overflow-hidden rounded-lg border border-line-2 bg-code">
      {lang && lang !== "plaintext" && (
        <span className="pointer-events-none absolute top-2.5 right-3 text-[11px] font-medium text-fg-3 select-none group-focus-within:opacity-0 group-hover:opacity-0">
          {lang}
        </span>
      )}
      <div className="absolute top-2 right-2">
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "복사됨" : "코드 복사"}
          className="flex items-center gap-1 rounded-md border border-line bg-bg px-2 py-1 text-[12px] font-medium text-fg-2 opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          {copied ? (
            <>
              <CheckIcon /> 복사됨
            </>
          ) : (
            <>
              <CopyIcon /> 복사
            </>
          )}
        </button>
      </div>
      <pre ref={ref} {...props}>
        {children}
      </pre>
      <span className="sr-only" aria-live="polite">
        {copied ? "코드를 복사했어요" : ""}
      </span>
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
