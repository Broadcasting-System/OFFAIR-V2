import Link from "next/link";
import { LockIcon, PencilIcon } from "@/components/shell/icons";
import { loginHref } from "@/lib/wiki/links";

/**
 * 로그인 벽 (시안 f8-L). 손님이 부원 공간·부원 문서·편집 화면을 열면 본문 자리에 나온다.
 *
 *  - login     : 로그인 안 함 → [로그인] 이 /login?next=<지금 주소> 로 보낸다.
 *                /login 은 Cloudflare Access 가 지키는 경로라 Access 로그인을 거친 뒤 같은 주소로 돌아온다
 *                (app/login/route.ts, docs/wiki-backend.md "로그인 벽").
 *  - forbidden : 로그인은 했지만 부원이 아님(교사·승인 대기 등)
 *  - no-edit   : 읽을 수는 있지만 고칠 권한이 없음 (졸업생 등)
 */
export function LoginWall({
  next,
  mode = "login",
  what = "space",
}: {
  /** 로그인 뒤 돌아올 주소 (사이트 안 경로) */
  next: string;
  mode?: "login" | "forbidden" | "no-edit";
  /** 문구: 부원 공간 / 편집 화면 */
  what?: "space" | "edit";
}) {
  const edit = what === "edit" || mode === "no-edit";
  const title =
    mode === "no-edit" ? "편집 권한이 없어요" : mode === "forbidden" ? "부원만 볼 수 있어요" : edit ? "로그인하면 고칠 수 있어요" : "부원만 볼 수 있어요";
  const text =
    mode === "no-edit"
      ? "이 계정은 문서를 읽을 수만 있어요. 고치려면 부장에게 부원 권한을 받아 주세요."
      : mode === "forbidden"
        ? "이 계정은 부원 공간을 볼 수 없어요. 방송부 부원이라면 부장에게 ONAIR 승인을 받아 주세요."
        : edit
          ? "문서 편집은 방송부 부원만 할 수 있어요. ONAIR 에 등록된 계정으로 로그인하면 바로 이 화면으로 돌아와요."
          : "방송부 부원 공간이에요. ONAIR 에 등록된 계정으로 로그인하면 바로 이 문서로 돌아와요.";
  const purple = !edit;
  return (
    <main id="main" tabIndex={-1} className="login-wall outline-none">
      <div className="login-wall-card">
        <span
          className={`mx-auto mb-3.5 grid size-[52px] place-items-center rounded-[14px] ${purple ? "bg-lock-bg text-lock" : "bg-accent-soft text-accent"}`}
        >
          {edit ? <PencilIcon size={26} /> : <LockIcon size={26} />}
        </span>
        <h1 className="mb-1.5 text-[20px] font-bold text-fg">{title}</h1>
        <p className="mb-[18px] text-[14px] leading-relaxed text-fg-2">{text}</p>
        {mode === "login" ? (
          <a
            href={loginHref(next)}
            className={`flex h-[42px] w-full items-center justify-center rounded-lg text-[15px] font-semibold transition-[filter] hover:brightness-110 ${purple ? "bg-lock text-lock-fg" : "bg-accent text-accent-fg"}`}
          >
            로그인
          </a>
        ) : (
          <Link
            href="/"
            className="flex h-[42px] w-full items-center justify-center rounded-lg border border-line text-[15px] font-semibold text-fg transition-colors hover:bg-hover"
          >
            가이드북으로
          </Link>
        )}
        <small className="mt-3.5 block text-[12.5px] leading-relaxed text-fg-3">
          {mode === "login" ? (
            <>
              ONAIR 에 등록한 메일로 받은 코드를 넣는 Cloudflare 로그인이에요.
              <br />
              등록이 안 돼 있으면 부장에게 ONAIR 초대를 받아 주세요.
            </>
          ) : (
            <>다른 계정으로 들어가려면 내 메뉴에서 로그아웃한 뒤 다시 로그인하세요.</>
          )}
        </small>
      </div>
    </main>
  );
}
