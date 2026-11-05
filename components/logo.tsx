import Link from "next/link";

/** OFFAIR 로고: 파란 둥근 네모 + (선택) 글자. */
export function Logo({
  withWordmark = true,
  className = "",
}: {
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/"
      aria-label="OFFAIR 홈"
      className={`inline-flex items-center gap-2 rounded-md text-[15px] font-extrabold tracking-[0.06em] text-fg ${className}`}
    >
      <LogoMark />
      {withWordmark && <span>OFFAIR</span>}
    </Link>
  );
}

export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block flex-none rounded-[6px] bg-accent"
      style={{ width: size, height: size }}
    />
  );
}
