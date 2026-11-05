"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, DocIcon, FolderIcon, SearchIcon } from "@/components/shell/icons";
import { buildForest, findNode, keyOf, subtreeKeys, type DropTarget, type TGroup, type TNode } from "@/lib/wiki/tree-math";

/**
 * "다른 곳으로 옮기기" — 카테고리(맨 끝으로) 또는 문서(그 하위로)를 고르는 작은 창.
 * 옮기는 문서 자신과 그 하위는 고를 수 없다.
 */
export function MovePicker({
  groups,
  moving,
  onPick,
  onClose,
}: {
  groups: TGroup[];
  moving: string;
  onPick: (t: DropTarget) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const node = findNode(groups, moving);
  const blocked = useMemo(() => (node ? subtreeKeys(node.node) : new Set<string>()), [node]);
  const title = node?.node.doc.title ?? moving;

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const f = filter.trim().toLowerCase();
  const rows: React.ReactNode[] = [];
  for (const g of groups) {
    const docRows: React.ReactNode[] = [];
    const visit = (nodes: TNode[], depth: number) => {
      for (const n of nodes) {
        const k = keyOf(n.doc);
        if (blocked.has(k)) continue;
        if (!f || n.doc.title.toLowerCase().includes(f)) {
          docRows.push(
            <button
              key={k}
              type="button"
              onClick={() => onPick({ type: "inside", key: k })}
              className="flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[13.5px] text-fg-2 hover:bg-hover hover:text-fg"
              style={{ paddingLeft: 10 + depth * 16 }}
            >
              <DocIcon size={15} className="text-fg-3" />
              <span className="min-w-0 flex-1 truncate">{n.doc.title}</span>
              <span className="text-[11.5px] text-fg-3">하위로</span>
            </button>
          );
        }
        visit(n.children, depth + 1);
      }
    };
    visit(buildForest(g.items), 1);
    if (f && docRows.length === 0 && !g.category.toLowerCase().includes(f)) continue;
    rows.push(
      <div key={`c:${g.category}`} className="mt-1 first:mt-0">
        <button
          type="button"
          onClick={() => onPick({ type: "category", category: g.category, at: "end" })}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] font-semibold text-fg hover:bg-hover"
        >
          <FolderIcon size={15} className="text-fg-3" />
          <span className="min-w-0 flex-1 truncate">{g.category}</span>
          <span className="text-[11.5px] font-normal text-fg-3">맨 끝으로</span>
        </button>
        {docRows}
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[125] flex items-start justify-center px-3 pt-[10vh]" role="dialog" aria-modal aria-label={`「${title}」 옮길 곳 고르기`}>
      <div className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div className="relative flex max-h-[70dvh] w-full max-w-[420px] flex-col overflow-hidden rounded-[14px] border border-line bg-bg shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2 border-b border-line-2 px-4 py-3">
          <b className="min-w-0 flex-1 truncate text-[15px] text-fg">「{title}」 옮기기</b>
          <button type="button" onClick={onClose} aria-label="닫기" className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover">
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2 border-b border-line-2 px-4 py-2 text-fg-3">
          <SearchIcon size={16} />
          <input
            ref={inputRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="카테고리나 문서 찾기"
            aria-label="옮길 곳 찾기"
            className="w-full bg-transparent py-1 text-[14px] text-fg outline-none placeholder:text-fg-3"
          />
        </div>
        <div className="overflow-y-auto p-2">{rows}</div>
      </div>
    </div>,
    document.body
  );
}
