import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { LockIcon } from "@/components/shell/icons";
import { PageBar } from "@/components/shell/page-bar";
import { SiteFooter } from "@/components/site-footer";
import { OnairPanel } from "@/components/onair/onair-panel";
import { canStartOnair, canViewOnair, onairViewer, type OnairWho } from "@/lib/onair/viewer";
import { GUEST } from "@/lib/wiki/auth";
import { loginHref } from "@/lib/wiki/links";

/**
 * ONAIR 상태 (/onair). 서버 PC 의 ONAIR 세 부분이 켜져 있는지 보고, 부장·최고 관리자는 다시 켤 수 있다.
 * 요청마다 권한을 확인한다. ONAIR 서버가 꺼져 있어도 최근에 로그인한 부원은 알아본다 (lib/onair/viewer.ts).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ONAIR 상태",
  robots: { index: false, follow: false },
};

async function pageWho(): Promise<OnairWho> {
  const h = await headers();
  const req = new Request("http://offair.local/", { headers: new Headers(h) });
  try {
    return await onairViewer(req);
  } catch {
    return { viewer: GUEST, base: GUEST, fallback: false, onairDown: false, hasToken: false };
  }
}

export default async function OnairPage() {
  const who = await pageWho();
  if (!canViewOnair(who.viewer)) return <Wall who={who} />;

  return (
    <>
      <PageBar crumbs={[{ label: "ONAIR 상태" }]} />
      <main id="main" tabIndex={-1} className="page-grid flex-1 outline-none">
        <div className="pt-[18px] pb-20">
          <h1 className="text-[28px] leading-[1.3] font-bold tracking-[-0.01em] text-fg sm:text-[34px]">ONAIR 상태</h1>
          <p className="mt-2.5 text-[16px] text-fg-2 sm:text-[17px]">방송실 서버 PC 에서 도는 ONAIR 세 부분이 켜져 있는지 봐요.</p>
          <OnairPanel canStart={canStartOnair(who.viewer)} recent={who.fallback} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function Wall({ who }: { who: OnairWho }) {
  const v = who.viewer;
  // 로그인 안 함 / ONAIR 가 꺼져 있어 누구인지 모름 / 부원이 아님
  const mode = !who.hasToken ? "login" : !v.authenticated && who.onairDown ? "unknown" : !v.authenticated ? "login" : "forbidden";
  const title = mode === "login" ? "로그인이 필요해요" : mode === "unknown" ? "누구인지 확인하지 못했어요" : "방송부 부원만 볼 수 있어요";
  const text =
    mode === "login"
      ? "ONAIR 상태는 방송부 부원만 볼 수 있어요. ONAIR 에 등록된 계정으로 로그인하면 이 화면으로 돌아와요."
      : mode === "unknown"
        ? "ONAIR 서버가 답하지 않아 로그인 정보를 확인하지 못했어요. 최근 30일 안에 ONAIR 가 켜져 있을 때 OFFAIR 에 로그인한 적이 있는 부원만 여기서 알아볼 수 있어요."
        : "이 계정은 ONAIR 상태를 볼 수 없어요.";
  return (
    <main id="main" tabIndex={-1} className="login-wall outline-none">
      <div className="login-wall-card">
        <span className="mx-auto mb-3.5 grid size-[52px] place-items-center rounded-[14px] bg-lock-bg text-lock">
          <LockIcon size={26} />
        </span>
        <h1 className="mb-1.5 text-[20px] font-bold text-fg">{title}</h1>
        <p className="mb-[18px] text-[14px] leading-relaxed text-fg-2">{text}</p>
        {mode === "login" ? (
          <a
            href={loginHref("/onair")}
            className="flex h-[42px] w-full items-center justify-center rounded-lg bg-lock text-[15px] font-semibold text-lock-fg transition-[filter] hover:brightness-110"
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
        {mode === "unknown" && (
          <small className="mt-3.5 block text-[12.5px] leading-relaxed text-fg-3">
            이 경우에는 서버 PC 에 원격으로 들어가 바탕화면의 &apos;ONAIR 시작&apos; 을 실행해 주세요.
          </small>
        )}
      </div>
    </main>
  );
}
