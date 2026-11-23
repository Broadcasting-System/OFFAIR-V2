"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import { ApiError, canEditNow, useMe } from "@/lib/wiki/client";
import {
  deleteComment,
  editComment,
  keepMentions,
  likeComment,
  listComments,
  postComment,
  resolveComment,
  type Anchor,
  type CommentList,
  type CommentT,
  type Mention,
} from "@/lib/wiki/comments-client";
import type { SpaceKey } from "@/lib/wiki/links";

/**
 * 문서 댓글 상태 (시안 f7 "B + A").
 * 댓글은 문서를 읽을 수 있는 사람(canReadMembers)에게만 보이고, 손님에게는 아무것도 그리지 않는다.
 * 쓰기·해결·좋아요는 편집할 수 있는 사람만, 고치기는 내 것만, 지우기는 내 것 또는 부장.
 */

export interface Draft {
  anchor: Anchor;
}

interface Ctx {
  space: SpaceKey;
  slug: string[];
  visible: boolean;
  canWrite: boolean;
  canModerate: boolean;
  myId: string | null;
  myName: string;
  list: CommentList | null;
  inline: CommentT[];
  docLevel: CommentT[];
  total: number;
  active: string | null;
  setActive: (id: string | null) => void;
  draft: Draft | null;
  setDraft: (d: Draft | null) => void;
  sheetOpen: boolean;
  setSheetOpen: (v: boolean) => void;
  /** 여백 카드가 보일 만큼 넓은가 (CommentLayer 가 정한다) */
  wide: boolean;
  setWide: (v: boolean) => void;
  add: (body: string, mentions: Mention[], opts?: { parentId?: string; anchor?: Anchor | null }) => Promise<boolean>;
  edit: (id: string, body: string, mentions: Mention[]) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  resolve: (id: string, resolved: boolean) => Promise<void>;
  like: (id: string, like: boolean) => Promise<void>;
}

const CommentsCtx = createContext<Ctx | null>(null);

export function useComments(): Ctx | null {
  return useContext(CommentsCtx);
}

function countOf(cs: CommentT[]): number {
  return cs.reduce((n, c) => n + (c.deleted ? 0 : 1) + c.replies.length, 0);
}

export function CommentsProvider({ space, slug, children }: { space: SpaceKey; slug: string[]; children: React.ReactNode }) {
  const me = useMe();
  const visible = !!me?.canReadMembers;
  const [list, setList] = useState<CommentList | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const slugKey = slug.join("/");

  const reload = useCallback(async () => {
    try {
      setList(await listComments(space, slugKey.split("/")));
    } catch {
      /* 권한이 없거나 서버가 꺼짐 — 댓글 화면을 그리지 않는다 */
      setList(null);
    }
  }, [space, slugKey]);

  useEffect(() => {
    if (!visible) return;
    // 바깥(API)에서 댓글을 받아 온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [visible, reload]);

  const run = useCallback(
    async (task: () => Promise<unknown>, fail = "요청이 실패했어요.") => {
      try {
        await task();
        await reload();
        return true;
      } catch (e) {
        toast({ message: e instanceof ApiError ? e.message : fail, tone: "error" });
        return false;
      }
    },
    [reload]
  );

  const value = useMemo<Ctx>(() => {
    const all = list?.comments ?? [];
    const inline = all.filter((c) => c.anchor && !c.resolved && !(c.deleted && c.replies.length === 0));
    const docLevel = all.filter((c) => !c.anchor);
    const s = slugKey.split("/");
    return {
      space,
      slug: s,
      visible: visible && !!list,
      canWrite: canEditNow(me),
      canModerate: !!me?.canModerate,
      myId: me?.memberId ?? null,
      myName: me?.name ?? "",
      list,
      inline,
      docLevel,
      total: countOf(all),
      active,
      setActive,
      draft,
      setDraft,
      sheetOpen,
      setSheetOpen,
      wide,
      setWide,
      add: async (body, mentions, opts = {}) => {
        let createdId: string | null = null;
        const ok = await run(async () => {
          const c = await postComment(space, s, { body, parentId: opts.parentId, anchor: opts.anchor ?? null, mentions: keepMentions(body, mentions) });
          createdId = c.id;
        }, "댓글을 남기지 못했어요.");
        if (ok && opts.anchor && createdId) setActive(createdId);
        return ok;
      },
      edit: (id, body, mentions) => run(() => editComment(space, s, id, body, keepMentions(body, mentions)), "고치지 못했어요."),
      remove: async (id) => {
        await run(() => deleteComment(space, s, id), "지우지 못했어요.");
      },
      resolve: async (id, resolved) => {
        const ok = await run(() => resolveComment(space, s, id, resolved));
        if (ok) {
          if (resolved && active === id) setActive(null);
          toast({ message: resolved ? "해결됨으로 표시했어요" : "댓글을 다시 열었어요" });
        }
      },
      like: async (id, like) => {
        await run(() => likeComment(space, s, id, like));
      },
    };
  }, [list, slugKey, space, visible, me, active, draft, sheetOpen, wide, run]);

  return <CommentsCtx.Provider value={value}>{children}</CommentsCtx.Provider>;
}
