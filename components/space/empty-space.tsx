"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { DocIcon, PlusIcon } from "@/components/shell/icons";
import { createDoc, useTree } from "@/components/manage/tree-ops";
import { canEditNow, useMe } from "@/lib/wiki/client";

/** 문서가 하나도 없는 공간의 첫 화면 — 편집할 수 있는 사람에게는 "새 문서" */
export function EmptySpace({ categories }: { categories: string[] }) {
  const me = useMe();
  const router = useRouter();
  const { busy } = useTree();
  const nav = useMemo(() => ({ push: (h: string) => router.push(h), replace: (h: string) => router.replace(h), refresh: () => router.refresh() }), [router]);
  return (
    <div className="mt-10 rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-hover text-fg-3">
        <DocIcon size={24} />
      </span>
      <p className="mt-4 text-[17px] font-bold text-fg">아직 문서가 없어요</p>
      <p className="mt-1 text-[14px] text-fg-3">
        {canEditNow(me) ? "첫 문서를 만들어 보세요. 서랍의 트리에서도 만들 수 있어요." : "부원이 문서를 쓰면 여기에 보여요."}
      </p>
      {canEditNow(me) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void createDoc(nav, { category: categories[0] ?? "문서" })}
          className="mx-auto mt-5 inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          <PlusIcon size={16} />새 문서
        </button>
      )}
    </div>
  );
}
