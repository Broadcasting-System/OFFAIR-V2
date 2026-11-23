import Link from "next/link";
import localFont from "next/font/local";
import { LOGOUT_HREF, loginHref } from "@/lib/wiki/links";

/**
 * 로그인 벽 (시안 C · 방송 대기 화면, _자료/시안/OFFAIR-위키-시안/login-wall/C.png).
 * 가이드북·개발 문서 모두 부원 전용이라, 읽을 수 없는 사람이 어느 화면을 열어도 본문 자리에 이 화면만 나온다
 * (components/members/read-gate.tsx). 송출이 꺼진 방송 화면처럼: 속이 빈 "OFF AIR", 한 줄, 단추 하나, 맨 아래 컬러바.
 *
 *  - login     : 로그인 안 함 → [로그인] 이 /login?next=<지금 주소> 로 보낸다 (Cloudflare Access 를 거쳐 돌아온다)
 *  - forbidden : 로그인은 했지만 부원이 아님(교사·승인 대기 등) → 다른 계정으로 들어가게 로그아웃
 *  - no-edit   : 읽을 수는 있지만 고칠 권한이 없음 (졸업생 등)
 *
 * 문구는 짧게, 설명 글 없이 (방송부 화면 규칙).
 */
const orbitron = localFont({ src: "../../app/fonts/Orbitron.ttf", weight: "400 900", display: "swap" });

const BARS = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];

export function LoginWall({
  next,
  mode = "login",
  what = "space",
}: {
  /** 로그인 뒤 돌아올 주소 (사이트 안 경로) */
  next: string;
  mode?: "login" | "forbidden" | "no-edit";
  /** 문구: 문서 / 편집 화면 */
  what?: "space" | "edit";
}) {
  const edit = what === "edit" || mode === "no-edit";
  const title =
    mode === "no-edit" ? "편집 권한이 없어요" : mode === "forbidden" || !edit ? "부원만 볼 수 있어요" : "로그인하면 고칠 수 있어요";
  const button = "inline-flex h-10 items-center justify-center rounded-md px-5 text-[15px] font-semibold";
  return (
    <main id="main" tabIndex={-1} className="login-wall outline-none">
      <span className={`login-wall-id ${orbitron.className}`} aria-hidden>
        BSSM BROADCAST
      </span>
      <p className={`login-wall-big ${orbitron.className}`} aria-hidden>
        OFF AIR
      </p>
      <h1 className="mb-[22px] text-[20px] font-semibold text-fg">{title}</h1>
      {mode === "login" ? (
        <a href={loginHref(next)} className={`${button} bg-accent text-accent-fg transition-colors hover:bg-accent-hover`}>
          로그인
        </a>
      ) : mode === "forbidden" ? (
        <a href={LOGOUT_HREF} className={`${button} border border-line text-fg transition-colors hover:bg-hover`}>
          다른 계정으로 로그인
        </a>
      ) : (
        <Link href="/" className={`${button} border border-line text-fg transition-colors hover:bg-hover`}>
          가이드북으로
        </Link>
      )}
      <div className="login-wall-bars" aria-hidden>
        {BARS.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </div>
    </main>
  );
}
