"use client";

import Link from "next/link";
import { BookIcon, LockIcon } from "./icons";
import { SPACE_LABEL, type SpaceKey } from "@/lib/wiki/links";

/**
 * 서랍 맨 위 공간 탭 (시안 g2-B). 가이드북(공개) · 부원 공간(부원만) 두 칸을 늘 보여 주고
 * 한 번 눌러 옮긴다. 부원 공간은 /members — 손님이면 그곳에서 로그인 벽이 나온다.
 */
export function SpaceSwitcher({ space }: { space: SpaceKey }) {
  return (
    <nav
      aria-label="공간"
      className="grid min-w-0 flex-1 grid-cols-2 gap-[3px] rounded-[9px] border border-line-2 bg-bg-soft p-[3px]"
    >
      {(["guide", "members"] as SpaceKey[]).map((s) => {
        const on = s === space;
        return (
          <Link
            key={s}
            href={s === "guide" ? "/" : "/members"}
            aria-current={on ? "page" : undefined}
            className={`flex h-[30px] min-w-0 items-center justify-center gap-1.5 rounded-[7px] text-[13px] font-semibold transition-colors ${
              on
                ? `seg-on ${s === "members" ? "text-lock" : "text-fg"}`
                : "text-fg-3 hover:bg-hover hover:text-fg-2"
            }`}
          >
            {s === "guide" ? <BookIcon size={15} /> : <LockIcon size={14} />}
            <span className="truncate">{SPACE_LABEL[s]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** 탭 아래 한 줄: "공개 · 문서 29" */
export function spaceSub(space: SpaceKey, count: number | null) {
  return `${space === "guide" ? "공개" : "부원만"}${count !== null ? ` · 문서 ${count}` : ""}`;
}
