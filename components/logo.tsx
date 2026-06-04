import Link from "next/link";

export function Logo({
  withTagline = false,
  className = "",
}: {
  withTagline?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/"
      className={`group inline-flex flex-col leading-none ${className}`}
      aria-label="OFFAIR 홈"
    >
      <span className="font-display text-xl font-extrabold tracking-[0.06em] text-white transition-[text-shadow] group-hover:text-glow">
        OFFAIR
      </span>
      {withTagline && (
        <span className="mt-1 font-display text-[0.55rem] font-medium uppercase tracking-[0.32em] text-fg-faint">
          BSSM Broadcast Guide Book
        </span>
      )}
    </Link>
  );
}
