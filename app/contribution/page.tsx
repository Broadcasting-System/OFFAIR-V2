import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import { MDX } from "@/lib/mdx";
import { EditFab } from "@/components/dev/edit-fab";
import { PageBar } from "@/components/shell/page-bar";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "문서 기여 가이드",
  description: "OFFAIR 가이드북 문서를 작성·수정하는 방법",
};

export default async function ContributionPage() {
  const source = fs.readFileSync(
    path.join(process.cwd(), "content", "contribution.mdx"),
    "utf8"
  );

  return (
    <>
      <PageBar
        crumbs={[{ label: "가이드북", href: "/" }, { label: "문서 기여" }]}
      />
      <main id="main" tabIndex={-1} className="page-grid flex-1 outline-none">
        <article className="pt-[18px] pb-20">
          <header className="mb-[26px]">
            <span className="inline-flex rounded-full bg-accent-soft px-[9px] py-[3px] text-xs font-semibold text-accent">
              기여
            </span>
            <h1 className="mt-3 text-[28px] leading-[1.3] font-bold tracking-[-0.01em] text-fg sm:text-[34px]">
              문서 기여 가이드
            </h1>
            <p className="mt-2.5 text-[16px] text-fg-2 sm:text-[17px]">
              새 문서를 추가하거나 기존 문서를 다듬는 방법.
            </p>
          </header>
          <div className="prose">
            <MDX source={source} />
          </div>
        </article>
      </main>
      <SiteFooter />
      <EditFab relPath="contribution.mdx" />
    </>
  );
}
