import Link from "next/link";
import localFont from "next/font/local";
import "./logo.css";

// 예전 가이드북부터 쓰던 OFFAIR 글자 로고 (Orbitron, 전기 파랑). 색은 logo.css.
const orbitron = localFont({
  src: "../app/fonts/Orbitron.ttf",
  weight: "400 900",
  display: "swap",
});

/** OFFAIR 로고: Orbitron 글자 + (선택) 영문 부제. */
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
      className={`${orbitron.className} inline-flex flex-col rounded-md leading-none ${className}`}
    >
      <span className="offair-logo text-[17px] font-extrabold tracking-[0.06em]">OFFAIR</span>
      {withTagline && (
        <span className="mt-1 text-[0.55rem] font-medium uppercase tracking-[0.32em] text-fg-faint">
          BSSM Broadcast Guide Book
        </span>
      )}
    </Link>
  );
}

/** 좁은 자리(왼쪽 레일)용: 같은 글자 로고를 OFF / AIR 두 줄로. */
export function LogoMark() {
  return (
    <span
      aria-hidden
      className={`${orbitron.className} flex flex-col items-center text-[9.5px] font-extrabold leading-[1.05] tracking-[0.06em] offair-logo`}
    >
      <span>OFF</span>
      <span>AIR</span>
    </span>
  );
}
