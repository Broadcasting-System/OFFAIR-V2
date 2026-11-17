"use client";

import { useState } from "react";
import { CommentIcon } from "@/components/shell/icons";
import { Avatar } from "@/components/ui/avatar";
import { useComments } from "./context";
import { MentionInput } from "./mention-input";
import { DocThread, ResolvedThread } from "./thread";

/** 위 막대의 "댓글 N" — 넓으면 아래 댓글로, 좁으면 글 댓글 시트를 연다 */
export function CommentsButton() {
  const c = useComments();
  if (!c?.visible) return null;
  function onClick() {
    if (!c) return;
    if (!c.wide && c.inline.length > 0) {
      c.setSheetOpen(true);
      return;
    }
    document.getElementById("comments")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const has = c.total > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`댓글 ${c.total}개`}
      className={`inline-flex h-8 flex-none items-center gap-1.5 rounded-md px-3 text-sm transition-colors ${
        has ? "bg-sel font-semibold text-accent hover:brightness-95" : "font-medium text-fg-2 hover:bg-hover"
      }`}
    >
      <CommentIcon size={16} />
      <span className="max-[480px]:hidden">댓글</span> {c.total}
    </button>
  );
}

/** 문서 아래 "댓글 N" — 문서 전체에 다는 댓글과 해결된 글 댓글 */
export function CommentSection() {
  const c = useComments();
  const [showResolved, setShowResolved] = useState(false);
  if (!c?.visible) return null;
  const docCount = c.docLevel.reduce((n, t) => n + (t.deleted ? 0 : 1) + t.replies.length, 0);
  const resolved = (c.list?.comments ?? []).filter((t) => t.anchor && t.resolved);
  return (
    <section id="comments" aria-labelledby="comments-h" className="mt-7 scroll-mt-[72px] border-t border-line pt-[18px]" data-cmt-ui>
      <h2 id="comments-h" className="mb-3.5 flex items-center gap-2 text-[16px] font-bold text-fg">
        댓글 {docCount}
        {c.inline.length > 0 && (
          <span className="text-[12.5px] font-normal text-fg-3">
            · 본문에 단 댓글 {c.inline.length}
            {!c.wide && (
              <button type="button" onClick={() => c.setSheetOpen(true)} className="ml-1.5 font-medium text-accent hover:underline">
                보기
              </button>
            )}
          </span>
        )}
      </h2>
      {c.docLevel.map((t) => (
        <DocThread key={t.id} thread={t} />
      ))}
      {c.canWrite ? (
        <div className="mt-1 flex items-start gap-2.5">
          <span className="mt-[5px]">
            <Avatar name={c.myName || "나"} size={26} />
          </span>
          <MentionInput people={c.list?.people ?? []} placeholder="댓글 남기기… @ 로 부원 부르기" onSubmit={(body, ms) => c.add(body, ms)} />
        </div>
      ) : (
        <p className="text-[13px] text-fg-3">댓글은 부원만 남길 수 있어요.</p>
      )}
      {resolved.length > 0 && (
        <div className="mt-5">
          <button type="button" onClick={() => setShowResolved((v) => !v)} aria-expanded={showResolved} className="text-[12.5px] font-medium text-fg-3 hover:text-fg">
            해결된 글 댓글 {resolved.length}개 {showResolved ? "접기" : "보기"}
          </button>
          {showResolved && (
            <div className="mt-2 divide-y divide-line-2">
              {resolved.map((t) => (
                <ResolvedThread key={t.id} thread={t} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
