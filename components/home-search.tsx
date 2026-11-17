"use client";

import { SearchIcon } from "@/components/shell/icons";
import { openSearch } from "@/components/shell/ui-prefs";

/** 홈의 큰 검색 칸. 누르면 공용 검색 창(⌘K)을 연다. */
export function HomeSearch() {
  return (
    <button
      type="button"
      onClick={openSearch}
      aria-label="문서 검색 열기"
      className="flex h-12 w-full items-center gap-3 rounded-lg border border-line bg-bg px-4 text-left text-[15px] text-fg-3 shadow-[0_1px_2px_rgba(9,30,66,0.06)] transition-colors hover:border-fg-3"
    >
      <SearchIcon size={20} />
      <span className="flex-1 truncate">무엇을 찾고 있나요? 장비 이름, 화면, 기능…</span>
      <kbd className="hidden rounded border border-line px-1.5 text-xs text-fg-3 sm:inline">
        ⌘K
      </kbd>
    </button>
  );
}
