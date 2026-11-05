"use client";

import { useCallback } from "react";
import { WikiEditor, type CommentTarget, type WikiEditorProps } from "./wiki-editor";
import { commentOnRange } from "@/lib/wiki/comments-client";
import type { SpaceKey } from "@/lib/wiki/links";

/**
 * /write 화면 — 편집기에 댓글 모드를 잇는다.
 * 고른 글의 DOM 범위로 자리(anchor: 고른 글 + 앞뒤 글)를 만들어 댓글 API 에 보낸다.
 * 읽기 화면은 같은 글자를 찾아 여백 카드로 보여 준다 (게시 뒤에도 고른 글이 남아 있으면 다시 찾는다).
 */
export function WriteScreen(props: Omit<WikiEditorProps, "onComment"> & { space: SpaceKey; path: string }) {
  const { space, path } = props;
  const onComment = useCallback(
    async (target: CommentTarget, _quote: string, body: string) => {
      if (!target.range || !target.root) throw new Error("댓글을 달 글을 다시 골라 주세요.");
      await commentOnRange({ space, slug: path.split("/"), root: target.root, range: target.range, body });
    },
    [space, path]
  );
  return <WikiEditor {...props} onComment={onComment} />;
}
