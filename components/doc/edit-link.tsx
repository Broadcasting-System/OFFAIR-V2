"use client";

import Link from "next/link";
import { PencilIcon } from "@/components/shell/icons";
import { canEditNow, useMe } from "@/lib/wiki/client";
import { editHref, type SpaceKey } from "@/lib/wiki/links";

/** 위 막대의 "편집" — 편집할 수 있는 사람에게만 보인다. 주소는 editHref 하나로 만든다. */
export function EditLink({ space, slug }: { space: SpaceKey; slug: string[] }) {
  const me = useMe();
  if (!canEditNow(me)) return null;
  return (
    <Link
      href={editHref(space, slug)}
      className="inline-flex h-8 flex-none items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
    >
      <PencilIcon size={15} className="min-[769px]:hidden" />
      편집
    </Link>
  );
}
