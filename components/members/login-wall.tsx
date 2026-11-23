import Link from "next/link";
import { LockIcon, PencilIcon } from "@/components/shell/icons";
import { LOGOUT_HREF, loginHref } from "@/lib/wiki/links";

/**
 * 로그인 벽 (시안 f8-L). 가이드북·개발 문서 모두 부원 전용이라, 읽을 수 없는 사람이 어느 화면을 열어도
 * 본문 자리에 이 카드만 나온다 (components/members/read-gate.tsx).
 *
 *  - login     : 로그인 안 함 → [로그인] 이 /login?next=<지금 주소> 로 보낸다.
 *                /login 은 Cloudflare Access 가 지키는 경로라 Access 로그인을 거친 뒤 같은 주소로 돌아온다
 *                (app/login/route.ts, docs/wiki-backend.md "로그인 벽").
 *  - forbidden : 로그인은 했지만 부원이 아님(교사·승인 대기 등) → 다른 계정으로 들어가게 로그아웃
 *  - no-edit   : 읽을 수는 있지만 고칠 권한이 없음 (졸업생 등)
 *
 * 문구는 짧게, 설명 글 없이 (방송부 화면 규칙).
 */
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
  const purple = !edit;
  const button = "flex h-[42px] w-full items-center justify-center rounded-lg text-[15px] font-semibold";
  return (
    <main id="main" tabIndex={-1} className="login-wall outline-none">
      <div className="login-wall-card">
        <span
          className={`mx-auto mb-3.5 grid size-[52px] place-items-center rounded-[14px] ${purple ? "bg-lock-bg text-lock" : "bg-accent-soft text-accent"}`}
        >
          {edit ? <PencilIcon size={26} /> : <LockIcon size={26} />}
        </span>
        <h1 className="mb-[18px] text-[20px] font-bold text-fg">{title}</h1>
        {mode === "login" ? (
          <a
            href={loginHref(next)}
            className={`${button} transition-[filter] hover:brightness-110 ${purple ? "bg-lock text-lock-fg" : "bg-accent text-accent-fg"}`}
          >
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
      </div>
    </main>
  );
}
