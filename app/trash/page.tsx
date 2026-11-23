import type { Metadata } from "next";
import { TrashList } from "@/components/manage/trash-list";
import { PageBar } from "@/components/shell/page-bar";
import { SiteFooter } from "@/components/site-footer";
import { readGate } from "@/components/members/read-gate";

export const metadata: Metadata = {
  title: "휴지통",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/** 휴지통: 지운 문서를 공간별로 모아 되살린다. 목록은 브라우저에서 API 로 받는다. 부원 전용 */
export default async function TrashPage() {
  const wall = await readGate("/trash");
  if (wall) return wall;
  return (
    <>
      <PageBar crumbs={[{ label: "가이드북", href: "/" }, { label: "휴지통" }]} />
      <main id="main" tabIndex={-1} className="page-grid flex-1 outline-none">
        <div className="pt-[18px] pb-20">
          <h1 className="text-[28px] leading-[1.3] font-bold tracking-[-0.01em] text-fg sm:text-[34px]">휴지통</h1>
          <p className="mt-2.5 text-[16px] text-fg-2 sm:text-[17px]">
            지운 문서는 여기 남아요. 되살리면 지우기 전 내용 그대로 돌아와요.
          </p>
          <TrashList />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
