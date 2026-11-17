"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ListIcon, PencilIcon } from "./icons";
import {
  isMobileViewport,
  isTocPopOpen,
  hasTocRoom,
  setTocPop,
  togglePanel,
  usePanelOpen,
  useTocPop,
  useTocRoom,
} from "./ui-prefs";
import { TocSheet } from "@/components/toc";
import type { TocItem } from "@/lib/content";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * 본문 칼럼 맨 위 막대: 왼쪽 빵부스러기(공간 › 카테고리),
 * 오른쪽 `목차` 토글과 `편집` 버튼.
 *  - editHref 가 있으면 편집 버튼이 링크(dev 의 /edit 화면), 없으면 비활성.
 *  - toc 가 있으면 목차 버튼을 보여 준다 (모바일에선 아래 시트로 연다).
 */
export function PageBar({
  crumbs,
  toc,
  showEdit = false,
  editHref,
  actions,
}: {
  crumbs: Crumb[];
  toc?: TocItem[];
  showEdit?: boolean;
  editHref?: string;
  /** 목차 버튼 오른쪽에 붙는 버튼들 (기록·편집 등) */
  actions?: React.ReactNode;
}) {
  const tocOpen = usePanelOpen("toc");
  const [sheetOpen, setSheetOpen] = useState(false);
  const hasToc = !!toc && toc.length > 0;

  const tocRoom = useTocRoom();
  const tocPop = useTocPop();
  // 자리가 되면 본문 옆 칸을 열고 닫고(저장), 모자라면 버튼 아래 작은 창
  const tocShown = tocRoom ? tocOpen : tocPop;

  function onTocClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (isMobileViewport()) setSheetOpen((v) => !v);
    else if (hasTocRoom()) togglePanel("toc");
    else {
      const r = e.currentTarget.getBoundingClientRect();
      document.documentElement.style.setProperty(
        "--toc-pop-right",
        `${Math.max(12, document.documentElement.clientWidth - r.right)}px`
      );
      setTocPop(!isTocPopOpen());
    }
  }

  return (
    <>
      <div className="page-bar flex items-center gap-3 px-4 sm:px-[22px]">
        <nav aria-label="현재 위치" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1.5 text-[13px] text-fg-3">
            {crumbs.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && (
                  <li aria-hidden className="flex-none">
                    ›
                  </li>
                )}
                <li className={i === crumbs.length - 1 ? "min-w-0 truncate" : "flex-none"}>
                  {c.href ? (
                    <Link href={c.href} className="rounded hover:text-fg hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>
                      {c.label}
                    </span>
                  )}
                </li>
              </Fragment>
            ))}
          </ol>
        </nav>

        {hasToc && (
          <button
            type="button"
            onClick={onTocClick}
            data-toc-button
            aria-expanded={tocShown || sheetOpen}
            aria-controls={tocRoom ? "page-toc-side" : "page-toc"}
            className={`inline-flex h-8 flex-none items-center gap-1.5 rounded-md px-3 text-sm font-medium text-fg-2 transition-colors hover:bg-hover ${
              tocShown ? "min-[769px]:bg-hover min-[769px]:text-fg" : ""
            }`}
          >
            <ListIcon size={16} className="min-[769px]:hidden" />
            목차
          </button>
        )}

        {actions}

        {showEdit &&
          (editHref ? (
            <Link
              href={editHref}
              className="inline-flex h-8 flex-none items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
            >
              <PencilIcon size={15} className="min-[769px]:hidden" />
              편집
            </Link>
          ) : (
            <button
              type="button"
              disabled
              title="편집 기능은 준비 중이에요"
              className="inline-flex h-8 flex-none cursor-not-allowed items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-accent-fg opacity-45 max-[768px]:hidden"
            >
              <PencilIcon size={15} className="min-[769px]:hidden" />
              편집
            </button>
          ))}
      </div>

      {hasToc && (
        <TocSheet
          items={toc}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}
