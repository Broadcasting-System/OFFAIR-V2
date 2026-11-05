import Link from "next/link";
import type { Doc, DocMeta } from "@/lib/content";
import { formatDate, getDocFileInfo, readingMinutes } from "@/lib/doc-info";
import { PageBar } from "@/components/shell/page-bar";
import { TocCard } from "@/components/toc";
import { SiteFooter } from "@/components/site-footer";
import { EditLink } from "./edit-link";
import { RecordVisit } from "@/components/search/recent";
import {
  HistoryButton,
  HistoryPanel,
  HistoryProvider,
  HistorySwap,
} from "@/components/history/history";

/**
 * 문서 한 장의 화면 (레이아웃 D).
 * 위 막대(빵부스러기 · 목차 · 기록 · 편집) → 700px 본문(카테고리 칩 · 제목 · 설명 · 메타 ·
 * 본문 · 이전/다음) + 오른쪽 위 떠 있는 목차 카드. 기록을 열면 오른쪽에 수정 기록 패널이
 * 붙고, 버전을 고르면 본문 자리에 바뀐 곳을 표시한 비교 화면이 나온다.
 */
export function DocView({
  doc,
  prev,
  next,
  children,
}: {
  doc: Doc;
  prev: DocMeta | null;
  next: DocMeta | null;
  children: React.ReactNode;
}) {
  const info = getDocFileInfo(doc.slug);
  const minutes = readingMinutes(doc.body);

  return (
    <HistoryProvider space="guide" slug={doc.slug}>
      <PageBar
        crumbs={[{ label: "가이드북", href: "/" }, { label: doc.category }]}
        toc={doc.toc}
        actions={
          <>
            <HistoryButton />
            <EditLink space="guide" slug={doc.slug} />
          </>
        }
      />

      <div className="doc-body">
        <div className="doc-col">
          <main
            id="main"
            tabIndex={-1}
            className="page-grid flex-1 outline-none"
          >
            <HistorySwap>
              <article className="pt-[18px] pb-20">
                <header className="mb-[26px]">
                  <span className="inline-flex rounded-full bg-accent-soft px-[9px] py-[3px] text-xs font-semibold text-accent">
                    {doc.category}
                  </span>
                  <h1 className="mt-3 text-[28px] leading-[1.3] font-bold tracking-[-0.01em] text-fg sm:text-[34px]">
                    {doc.title}
                  </h1>
                  {doc.description && (
                    <p className="mt-2.5 text-[16px] leading-relaxed text-fg-2 sm:text-[17px]">
                      {doc.description}
                    </p>
                  )}
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-3">
                    {info.author && (
                      <>
                        <span
                          aria-hidden
                          className="grid size-[22px] place-items-center rounded-full bg-avatar text-[9px] font-bold text-avatar-fg"
                        >
                          {info.author.slice(0, 2)}
                        </span>
                        <span>{info.author}</span>
                        <span aria-hidden>·</span>
                      </>
                    )}
                    {info.updatedAt && (
                      <>
                        <time dateTime={info.updatedAt.toISOString()}>
                          {formatDate(info.updatedAt)} 수정
                        </time>
                        <span aria-hidden>·</span>
                      </>
                    )}
                    <span>{minutes}분 읽기</span>
                  </p>
                </header>

                <div className="prose">{children}</div>

                <PrevNext prev={prev} next={next} />
              </article>
            </HistorySwap>
          </main>
          <SiteFooter />
        </div>
        <HistoryPanel />
      </div>

      <TocCard items={doc.toc} />
      <RecordVisit
        space="guide"
        url={doc.url}
        title={doc.title}
        category={doc.category}
      />
    </HistoryProvider>
  );
}

function PrevNext({
  prev,
  next,
}: {
  prev: DocMeta | null;
  next: DocMeta | null;
}) {
  if (!prev && !next) return null;
  return (
    <nav
      aria-label="이전·다음 문서"
      className="mt-[34px] grid gap-3 sm:grid-cols-2"
    >
      {prev ? (
        <Link
          href={prev.url}
          className="group rounded-xl bg-bg-soft px-[18px] py-4 transition-colors hover:bg-hover"
        >
          <small className="mb-1 block text-xs text-fg-3">← 이전</small>
          <b className="font-semibold text-fg group-hover:text-accent">
            {prev.title}
          </b>
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}
      {next && (
        <Link
          href={next.url}
          className="group rounded-xl bg-bg-soft px-[18px] py-4 text-right transition-colors hover:bg-hover"
        >
          <small className="mb-1 block text-xs text-fg-3">다음 →</small>
          <b className="font-semibold text-fg group-hover:text-accent">
            {next.title}
          </b>
        </Link>
      )}
    </nav>
  );
}
