"use client";

import Link from "next/link";
import { BookIcon, CodeIcon } from "./icons";
import { SPACE_LABEL, spaceHome, type SpaceKey } from "@/lib/wiki/links";

/**
 * 서랍 맨 위 공간 탭 (시안 g2-B). 가이드북 · 개발 문서 두 칸을 늘 보여 주고 한 번 눌러 옮긴다.
 * 두 공간 모두 부원 전용이라 손님은 어느 쪽을 눌러도 로그인 벽을 본다.
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
            href={spaceHome(s)}
            aria-current={on ? "page" : undefined}
            className={`flex h-[30px] min-w-0 items-center justify-center gap-1.5 rounded-[7px] text-[13px] font-semibold transition-colors ${
              on ? "seg-on text-fg" : "text-fg-3 hover:bg-hover hover:text-fg-2"
            }`}
          >
            {s === "guide" ? <BookIcon size={15} /> : <CodeIcon size={15} />}
            <span className="truncate">{SPACE_LABEL[s]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** 탭 아래 한 줄: "문서 29" (모르면 빈 줄) */
export function spaceSub(count: number | null) {
  return count !== null ? `문서 ${count}` : "";
}
