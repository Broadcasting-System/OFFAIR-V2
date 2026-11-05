import type { Metadata } from "next";
import Link from "next/link";
import { LockIcon } from "@/components/shell/icons";
import { PageBar } from "@/components/shell/page-bar";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "부원 공간",
  robots: { index: false },
};

/** 부원 공간 자리. 로그인(인증)은 위키 백엔드 작업에서 붙인다. */
export default function MembersPage() {
  return (
    <>
      <PageBar
        crumbs={[{ label: "가이드북", href: "/" }, { label: "부원 공간" }]}
      />
      <main id="main" tabIndex={-1} className="page-grid flex-1 outline-none">
        <div className="pt-16 pb-24 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-lock-bg text-lock">
            <LockIcon size={26} />
          </span>
          <h1 className="mt-5 text-[26px] font-bold text-fg">부원 공간</h1>
          <p className="mx-auto mt-2 max-w-[420px] text-[16px] leading-relaxed text-fg-2">
            방송부 부원만 볼 수 있는 공간이에요. 로그인이 필요해요.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              type="button"
              disabled
              title="로그인 기능은 준비 중이에요"
              className="inline-flex h-9 cursor-not-allowed items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg opacity-45"
            >
              로그인 (준비 중)
            </button>
            <Link
              href="/"
              className="inline-flex h-9 items-center rounded-md border border-line px-4 text-sm font-medium text-fg transition-colors hover:bg-hover"
            >
              가이드북으로
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
