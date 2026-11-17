import { useId } from "react";

/**
 * OFFAIR 심볼 (시안 g5-5 '입자 물결'). ONAIR 송출 배경의 빨간 입자 산을 파랑 네온으로 옮긴 앱 아이콘.
 * 점은 고정 난수로 만들어 서버·브라우저 그림이 같다. app/icon.svg 도 같은 그림(scripts/gen-icon.mjs).
 *  - full: 레일·큰 자리 / small: 탭·작은 자리(점을 굵고 성기게)
 */
type Dot = [x: number, y: number, r: number, o: number];

function makeDots(step: number, perCol: number, scale: number): Dot[] {
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const out: Dot[] = [];
  for (let x = 20; x <= 100; x += step) {
    const h = 26 * Math.exp(-(((x - 50) / 12) ** 2)) + 14 * Math.exp(-(((x - 76) / 9) ** 2)) + 4;
    for (let k = 0; k < perCol; k++) {
      const y = 78 - h * rnd() - (k === 0 ? h * 0.85 : 0) + rnd() * 3;
      const cx = x + rnd();
      out.push([+cx.toFixed(1), +y.toFixed(1), +((0.7 + rnd() * 0.7) * scale).toFixed(2), +(0.45 + rnd() * 0.55).toFixed(2)]);
    }
  }
  return out;
}

const DOTS = { full: makeDots(1.6, 4, 1), small: makeDots(3.4, 3, 1.9) };

function hex(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

export function OffairMark({
  size = 32,
  detail = "full",
  className = "",
}: {
  size?: number;
  detail?: "full" | "small";
  className?: string;
}) {
  const p = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={`flex-none ${className}`} aria-hidden>
      <defs>
        <radialGradient id={`${p}bg`} cx=".5" cy=".5" r=".72">
          <stop offset="0" stopColor="#0b2f5e" />
          <stop offset=".5" stopColor="#06142a" />
          <stop offset="1" stopColor="#020509" />
        </radialGradient>
        <radialGradient id={`${p}halo`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#2f9bff" stopOpacity=".75" />
          <stop offset=".45" stopColor="#1a6fe0" stopOpacity=".28" />
          <stop offset="1" stopColor="#1a6fe0" stopOpacity="0" />
        </radialGradient>
        <filter id={`${p}soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="120" height="120" rx="28" fill={`url(#${p}bg)`} />
      <ellipse cx="56" cy="66" rx="44" ry="26" fill={`url(#${p}halo)`} opacity=".7" />
      <g filter={`url(#${p}soft)`} fill="#7ccaff">
        {DOTS[detail].map(([x, y, r, o], i) => (
          <circle key={i} cx={x} cy={y} r={r} opacity={o} />
        ))}
      </g>
      <path d="M18 80H102" stroke="#2f9bff" strokeWidth={detail === "small" ? 2.4 : 1.2} opacity=".6" />
      <polygon points={hex(44, 40, 6)} fill="none" stroke="#9fd4ff" strokeWidth={detail === "small" ? 3 : 1.6} />
      {detail === "full" && <polygon points={hex(80, 50, 4.5)} fill="none" stroke="#9fd4ff" strokeWidth="1.4" opacity=".8" />}
    </svg>
  );
}
