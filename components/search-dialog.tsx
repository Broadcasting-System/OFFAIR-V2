"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchDoc } from "@/lib/content";

interface Result extends SearchDoc {
  score: number;
  hit?: string;
}

function search(index: SearchDoc[], query: string): Result[] {
  const q = query.trim().toLowerCase();
  if (!q)
    return index.map((d) => ({ ...d, score: 0 }));
  const tokens = q.split(/\s+/);
  const out: Result[] = [];
  for (const d of index) {
    const title = d.title.toLowerCase();
    const desc = d.description.toLowerCase();
    const cat = d.category.toLowerCase();
    const headings = d.headings.map((h) => h.toLowerCase());
    const haystack = [title, desc, cat, ...headings].join("  ");
    if (!tokens.every((t) => haystack.includes(t))) continue;

    let score = 0;
    let hit: string | undefined;
    if (title.includes(q)) score += 100;
    if (title.startsWith(q)) score += 50;
    if (cat.includes(q)) score += 20;
    if (desc.includes(q)) score += 15;
    const h = d.headings.find((x) => x.toLowerCase().includes(q));
    if (h) {
      score += 10;
      hit = h;
    }
    out.push({ ...d, score, hit });
  }
  return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export function SearchDialog({
  index,
  open,
  onClose,
}: {
  index: SearchDoc[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => search(index, query).slice(0, 30), [index, query]);

  // 열릴 때마다 검색어 초기화 (렌더 중 상태 조정 패턴)
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActive(0);
    }
  }

  // 열리면 입력 칸에 포커스
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  // lock scroll while open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function go(url: string) {
    onClose();
    router.push(url);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[active];
      if (r) go(r.url);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  // keep active item in view
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-3 pt-[8vh] sm:px-4 sm:pt-[12vh]"
      role="dialog"
      aria-modal
      aria-label="문서 검색"
    >
      <div
        className="absolute inset-0 bg-scrim"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-[640px] overflow-hidden rounded-[10px] border border-line bg-bg shadow-[0_16px_50px_rgba(0,0,0,0.35)]"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="문서 검색…"
            aria-label="검색어"
            className="w-full bg-transparent py-3.5 text-[16px] text-fg outline-none placeholder:text-fg-3"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-line px-1.5 py-0.5 text-[11px] text-fg-3 hover:text-fg"
            aria-label="검색 닫기"
          >
            ESC
          </button>
        </div>

        <ul ref={listRef} className="max-h-[60dvh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-fg-3">
              검색 결과가 없습니다
            </li>
          )}
          {results.map((r, i) => (
            <li key={r.url} data-idx={i}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r.url)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left ${
                  i === active ? "bg-sel" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[14.5px] font-semibold ${
                      i === active ? "text-accent" : "text-fg"
                    }`}
                  >
                    {r.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-fg-2">
                    {r.hit ?? r.description}
                  </span>
                </span>
                <span className="hidden shrink-0 text-xs text-fg-3 sm:inline">
                  {r.category}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-xs text-fg-3 sm:flex">
          <span>
            <kbd className="rounded border border-line px-1">↑</kbd>{" "}
            <kbd className="rounded border border-line px-1">↓</kbd> 이동
          </span>
          <span>
            <kbd className="rounded border border-line px-1">↵</kbd> 열기
          </span>
        </div>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0 text-fg-3"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path
        d="m20 20-3-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
