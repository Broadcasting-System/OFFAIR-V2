import type { Metadata } from "next";
import Link from "next/link";
import { PageBar } from "@/components/shell/page-bar";
import { SiteFooter } from "@/components/site-footer";
import { formatDate, getRecentDocs } from "@/lib/doc-info";

export const metadata: Metadata = {
  title: "최근 바뀐 문서",
  description: "최근에 고쳐진 가이드북 문서 목록",
};

/** 최근 바뀐 문서 — 지금은 파일 수정 시각 기준. (위키 저장소가 붙으면 수정 기록으로) */
export default function RecentPage() {
  const docs = getRecentDocs();

  return (
    <>
      <PageBar
        crumbs={[{ label: "가이드북", href: "/" }, { label: "최근 바뀐 문서" }]}
      />
      <main id="main" tabIndex={-1} className="page-grid flex-1 outline-none">
        <div className="pt-[18px] pb-20">
          <h1 className="text-[28px] leading-[1.3] font-bold tracking-[-0.01em] text-fg sm:text-[34px]">
            최근 바뀐 문서
          </h1>
          <p className="mt-2.5 text-[16px] text-fg-2 sm:text-[17px]">
            최근에 고쳐진 순서대로 모았어요. 문서 {docs.length}개.
          </p>

          <ol className="mt-7 divide-y divide-line-2 border-y border-line-2">
            {docs.map((doc) => (
              <li key={doc.url}>
                <Link
                  href={doc.url}
                  className="group -mx-3 flex items-start gap-4 rounded-md px-3 py-3.5 transition-colors hover:bg-bg-soft"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg group-hover:text-accent">
                      {doc.title}
                    </span>
                    {doc.description && (
                      <span className="mt-0.5 block text-[14px] text-fg-2">
                        {doc.description}
                      </span>
                    )}
                    <span className="mt-1.5 inline-flex rounded-full bg-accent-soft px-2 py-px text-[11.5px] font-semibold text-accent">
                      {doc.category}
                    </span>
                  </span>
                  {doc.updatedAt && (
                    <time
                      dateTime={doc.updatedAt.toISOString()}
                      className="flex-none pt-0.5 text-[13px] text-fg-3"
                    >
                      {formatDate(doc.updatedAt)}
                    </time>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
