import Link from "next/link";
import localFont from "next/font/local";
import { OffairMark } from "./offair-mark";
import "./logo.css";

// 예전 가이드북부터 쓰던 OFFAIR 글자 로고 (Orbitron, 전기 파랑). 색은 logo.css.
const orbitron = localFont({
  src: "../app/fonts/Orbitron.ttf",
  weight: "400 900",
  display: "swap",
});

/** OFFAIR 로고: 심볼 + Orbitron 글자 + (선택) 영문 부제. */
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
      aria-label="OFFAIR 홈"
      className={`${orbitron.className} inline-flex items-center gap-2 rounded-md leading-none ${className}`}
    >
      <OffairMark size={26} detail="small" />
      <span className="flex flex-col">
        <span className="offair-logo text-[17px] font-extrabold tracking-[0.06em]">OFFAIR</span>
        {withTagline && (
          <span className="mt-1 text-[0.55rem] font-medium uppercase tracking-[0.32em] text-fg-faint">
            BSSM Broadcast Guide Book
          </span>
        )}
      </span>
    </Link>
  );
}
