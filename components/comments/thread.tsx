"use client";

import { Fragment, useState } from "react";
import { DarkMenu, type MenuItem } from "@/components/manage/dark-menu";
import { CheckIcon, MoreIcon, PencilIcon, RestoreIcon, ThumbUpIcon, TrashIcon } from "@/components/shell/icons";
import { Avatar } from "@/components/ui/avatar";
import type { CommentT, Mention, ReplyT } from "@/lib/wiki/comments-client";
import { dayLabel, whenLabel } from "@/lib/wiki/time";
import { useComments } from "./context";
import { MentionInput } from "./mention-input";

/** 댓글 글: 줄바꿈은 그대로, @이름 은 파란 꼬리표 */
export function Body({ text, mentions, className = "" }: { text: string; mentions?: Mention[]; className?: string }) {
  const names = (mentions ?? []).map((m) => m.name).sort((a, b) => b.length - a.length);
  if (names.length === 0) return <p className={`whitespace-pre-wrap break-words ${className}`}>{text}</p>;
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded bg-accent-soft px-[3px] whitespace-nowrap text-accent">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </p>
  );
}

/** ⋯ 메뉴 (내 것: 고치기·지우기, 부장: 지우기) */
function useItemMenu(item: ReplyT, onEdit: () => void) {
  const c = useComments()!;
  const mine = !!c.myId && item.author.memberId === c.myId;
  const items: MenuItem[] = [];
  if (mine && c.canWrite) items.push({ label: "고치기", icon: <PencilIcon size={15} />, run: onEdit });
  if ((mine && c.canWrite) || c.canModerate) items.push({ label: "지우기", icon: <TrashIcon size={15} />, danger: true, separated: items.length > 0, run: () => void c.remove(item.id) });
  return items;
}

function MoreButton({ item, onEdit, label }: { item: ReplyT; onEdit: () => void; label: string }) {
  const items = useItemMenu(item, onEdit);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (items.length === 0) return null;
  return (
    <>
      <button
        type="button"
        aria-label={`${label} 메뉴`}
        aria-haspopup="menu"
        onClick={(e) => setAnchor(e.currentTarget)}
        className="grid size-6 place-items-center rounded text-fg-3 hover:bg-hover hover:text-fg"
      >
        <MoreIcon size={15} />
      </button>
      {anchor && <DarkMenu label={`${label} 메뉴`} anchor={anchor} items={items} onClose={() => setAnchor(null)} />}
    </>
  );
}

function LikeButton({ item }: { item: ReplyT }) {
  const c = useComments()!;
  const likes = item.likes ?? [];
  const liked = !!c.myId && likes.includes(c.myId);
  return (
    <button
      type="button"
      disabled={!c.canWrite}
      onClick={() => void c.like(item.id, !liked)}
      aria-pressed={liked}
      aria-label={`좋아요 ${likes.length}`}
      className={`inline-flex items-center gap-1 rounded px-0.5 ${liked ? "text-accent" : "text-fg-3 hover:text-fg"} disabled:cursor-default`}
    >
      <ThumbUpIcon size={14} />
      {likes.length > 0 && <span>{likes.length}</span>}
    </button>
  );
}

/** 한 사람 글 (맨 위 댓글이나 답글) */
function Entry({
  item,
  avatar,
  dateStyle,
  actions,
}: {
  item: ReplyT;
  avatar: number;
  dateStyle: "day" | "when";
  actions?: React.ReactNode;
}) {
  const c = useComments()!;
  const [editing, setEditing] = useState(false);
  const deleted = (item as CommentT).deleted;
  return (
    <div className="flex gap-2.5">
      <Avatar name={item.author.name} size={avatar} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13.5px]">
          <b className="font-semibold text-fg">{item.author.name}</b>
          <span className="text-[12px] text-fg-3">
            {dateStyle === "day" ? dayLabel(new Date(item.createdAt)) : whenLabel(item.createdAt)}
            {item.updatedAt && !deleted ? " · 고침" : ""}
          </span>
          <span className="ml-auto flex items-center gap-1">
            {actions}
            {!deleted && <MoreButton item={item} onEdit={() => setEditing(true)} label={`${item.author.name}의 댓글`} />}
          </span>
        </div>
        {editing ? (
          <div className="mt-1.5 flex">
            <MentionInput
              people={c.list?.people ?? []}
              placeholder="댓글 고치기"
              submitLabel="저장"
              initial={item.body}
              initialMentions={item.mentions ?? []}
              autoFocus
              compact
              onCancel={() => setEditing(false)}
              onSubmit={async (body, mentions) => {
                const ok = await c.edit(item.id, body, mentions);
                if (ok) setEditing(false);
                return ok;
              }}
            />
          </div>
        ) : deleted ? (
          <p className="mt-[3px] text-[14px] text-fg-3 italic">지운 댓글이에요</p>
        ) : (
          <Body text={item.body} mentions={item.mentions} className="mt-[3px] text-[14px] leading-[1.6] text-fg" />
        )}
      </div>
    </div>
  );
}

/**
 * 여백 카드·아래 시트 카드 (시안 f7-B): 머리(사람·때·해결·⋯) → 글 → 답글들 → 답글 칸(고른 카드만).
 */
export function ThreadCard({
  thread,
  active,
  lost,
  showQuote,
  onActivate,
  onShowInText,
}: {
  thread: CommentT;
  active: boolean;
  lost: boolean;
  showQuote: boolean;
  onActivate: () => void;
  onShowInText?: () => void;
}) {
  const c = useComments()!;
  return (
    <div
      onClick={onActivate}
      data-cmt-ui
      className={`rounded-[10px] border bg-bg p-3 transition-shadow ${
        active ? "cmt-card-on border-[#f5cd47] shadow-[0_8px_24px_rgba(9,30,66,0.16)]" : "border-line shadow-[0_2px_8px_rgba(9,30,66,0.06)]"
      }`}
    >
      {(showQuote || lost) && thread.anchor && (
        <div className="mb-2 rounded-r border-l-[3px] border-[#f5cd47] bg-bg-soft px-2 py-0.5 text-[12.5px] text-fg-2">
          <span className="line-clamp-2">{thread.anchor.quote}</span>
        </div>
      )}
      {lost && <p className="mb-2 text-[12px] text-warn">본문이 바뀌어 위치를 찾지 못했어요</p>}
      <Entry
        item={thread}
        avatar={22}
        dateStyle="day"
        actions={
          c.canWrite && (
            <button
              type="button"
              title="해결"
              aria-label="해결됨으로 표시"
              onClick={(e) => {
                e.stopPropagation();
                void c.resolve(thread.id, true);
              }}
              className="grid size-6 place-items-center rounded text-fg-3 hover:bg-ok-bg hover:text-ok"
            >
              <CheckIcon size={15} />
            </button>
          )
        }
      />
      {thread.replies.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-2.5">
          {thread.replies.map((r) => (
            <Entry key={r.id} item={r} avatar={22} dateStyle="day" />
          ))}
        </div>
      )}
      {active && c.canWrite && (
        <div className="mt-2.5 flex" onClick={(e) => e.stopPropagation()}>
          <MentionInput people={c.list?.people ?? []} placeholder="답글…" compact autoFocus={false} onSubmit={(body, ms) => c.add(body, ms, { parentId: thread.id })} />
        </div>
      )}
      {onShowInText && !lost && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onShowInText();
          }}
          className="mt-2 text-[12.5px] font-medium text-accent hover:underline"
        >
          본문에서 보기
        </button>
      )}
    </div>
  );
}

/** 아래 목록의 스레드 (시안 f7-A): 답글 · 좋아요 · ⋯, 답글은 한 단계 들여쓰기 */
export function DocThread({ thread }: { thread: CommentT }) {
  const c = useComments()!;
  const [replying, setReplying] = useState(false);
  const acts = (item: ReplyT) => (
    <div className="mt-[5px] flex items-center gap-3 text-[12px] text-fg-3">
      {c.canWrite && (
        <button type="button" onClick={() => setReplying(true)} className="rounded hover:text-fg">
          답글
        </button>
      )}
      <LikeButton item={item} />
    </div>
  );
  return (
    <div className="pt-1 pb-4">
      <Entry item={thread} avatar={26} dateStyle="when" />
      {!thread.deleted && <div className="pl-9">{acts(thread)}</div>}
      {thread.replies.map((r) => (
        <div key={r.id} className="mt-3 ml-9">
          <Entry item={r} avatar={22} dateStyle="when" />
          <div className="pl-8">{acts(r)}</div>
        </div>
      ))}
      {replying && (
        <div className="mt-3 ml-9 flex">
          <MentionInput
            people={c.list?.people ?? []}
            placeholder="답글 남기기… @ 로 부원 부르기"
            compact
            autoFocus
            onCancel={() => setReplying(false)}
            onSubmit={async (body, ms) => {
              const ok = await c.add(body, ms, { parentId: thread.id });
              if (ok) setReplying(false);
              return ok;
            }}
          />
        </div>
      )}
    </div>
  );
}

/** 해결된 글 댓글 (아래 목록에 접어 둔다) */
export function ResolvedThread({ thread }: { thread: CommentT }) {
  const c = useComments()!;
  return (
    <div className="flex gap-2.5 py-2 opacity-80">
      <Avatar name={thread.author.name} size={22} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px]">
          <b className="font-semibold text-fg">{thread.author.name}</b>
          <span className="rounded bg-ok-bg px-1.5 text-[11.5px] text-ok">해결됨</span>
          {thread.resolved && <span className="text-[12px] text-fg-3">{thread.resolved.by.name} · {dayLabel(new Date(thread.resolved.at))}</span>}
          {c.canWrite && (
            <button type="button" onClick={() => void c.resolve(thread.id, false)} className="ml-auto inline-flex items-center gap-1 rounded text-[12px] text-fg-3 hover:text-fg">
              <RestoreIcon size={13} /> 다시 열기
            </button>
          )}
        </div>
        {thread.anchor && <p className="mt-1 truncate border-l-[3px] border-[#f5cd47] pl-2 text-[12.5px] text-fg-2">{thread.anchor.quote}</p>}
        <Body text={thread.deleted ? "지운 댓글이에요" : thread.body} mentions={thread.mentions} className="mt-1 text-[13.5px] text-fg-2" />
        {thread.replies.length > 0 && <p className="mt-0.5 text-[12px] text-fg-3">답글 {thread.replies.length}개</p>}
      </div>
    </div>
  );
}
