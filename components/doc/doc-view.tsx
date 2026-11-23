import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/shell/icons";
import type { ContentSpace, Doc, DocMeta } from "@/lib/content";
import { formatDate, getDocInfo, readingMinutes } from "@/lib/doc-info";
import { SPACE_LABEL, spaceHome } from "@/lib/wiki/links";
import { PageBar } from "@/components/shell/page-bar";
import { TocPop, TocSide } from "@/components/toc";
import { SiteFooter } from "@/components/site-footer";
import { EditLink } from "./edit-link";
import { CommentsProvider } from "@/components/comments/context";
import { CommentLayer } from "@/components/comments/layer";
import { CommentsButton, CommentSection } from "@/components/comments/section";
import { RecordVisit } from "@/components/search/recent";
import {
  HistoryButton,
  HistoryPanel,
  HistoryProvider,
  HistorySwap,
} from "@/components/history/history";

/**
 * 문서 한 장의 화면 (레이아웃 D).
 * 위 막대(빵부스러기 · 목차 · 기록 · 편집) → 780px 본문(카테고리 칩 · 제목 · 설명 · 메타 ·
 * 본문 · 이전/다음) + 본문 옆 목차 칸(시안 f9-A, 한 묶음으로 가운데). 자리가 모자라면 목차는
 * [목차] 버튼의 작은 창. 기록을 열면 오른쪽에 수정 기록 패널이
 * 붙고, 버전을 고르면 본문 자리에 바뀐 곳을 표시한 비교 화면이 나온다.
 */
export async function DocView({
  doc,
  prev,
  next,
  space = "guide",
  children,
}: {
  doc: Doc;
  prev: DocMeta | null;
  next: DocMeta | null;
  /** 빵부스러기 첫 칸: 가이드북 또는 개발 문서 */
  space?: ContentSpace;
  children: React.ReactNode;
}) {
  const info = await getDocInfo(space, doc);
  const minutes = readingMinutes(doc.body);
  const home = spaceHome(space);

  return (
    <HistoryProvider space={space} slug={doc.slug}>
      <CommentsProvider space={space} slug={doc.slug}>
        <PageBar
          crumbs={[{ label: SPACE_LABEL[space], href: home }, { label: doc.category }]}
          toc={doc.toc}
          actions={
            <>
              <CommentsButton />
              <HistoryButton />
              <EditLink space={space} slug={doc.slug} />
            </>
          }
        />

        <div className="doc-body">
          <div className="doc-col">
            <main
              id="main"
              tabIndex={-1}
              className={`page-grid flex-1 outline-none ${doc.toc.length > 0 ? "has-toc" : ""}`}
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

                  <CommentLayer>
                    <div className="prose">{children}</div>
                  </CommentLayer>

                  <CommentSection />

                  <PrevNext prev={prev} next={next} />
                </article>
              </HistorySwap>
              <TocSide items={doc.toc} />
            </main>
            <SiteFooter />
          </div>
          <HistoryPanel />
        </div>

        <TocPop items={doc.toc} />
        <RecordVisit
          space={space}
          url={doc.url}
          title={doc.title}
          category={doc.category}
        />
      </CommentsProvider>
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
          <small className="mb-1 flex items-center gap-1 text-xs text-fg-3"><ArrowLeftIcon size={13} />이전</small>
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
          <small className="mb-1 flex items-center justify-end gap-1 text-xs text-fg-3">다음<ArrowRightIcon size={13} /></small>
          <b className="font-semibold text-fg group-hover:text-accent">
            {next.title}
          </b>
        </Link>
      )}
    </nav>
  );
}
