import Link from "next/link";
import { IS_DEV } from "@/lib/dev";

/** Dev-only floating button that jumps into edit mode. */
export function EditFab({
  relPath,
  href,
  label = "수정",
}: {
  relPath?: string;
  href?: string;
  label?: string;
}) {
  if (!IS_DEV) return null;
  const target = href ?? `/edit/${(relPath ?? "").replace(/\.mdx$/, "")}`;

  return (
    <Link
      href={target}
      className="fixed right-5 bottom-5 z-40 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-pop transition-colors hover:bg-accent-hover"
      title="수정 (dev)"
    >
      <PencilIcon />
      {label}
    </Link>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M13.5 6.5l3 3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
