import type { Metadata } from "next";
import Link from "next/link";
import { LockIcon } from "@/components/shell/icons";
import { PageBar } from "@/components/shell/page-bar";
import { SiteFooter } from "@/components/site-footer";
import { MembersBand } from "@/components/members/band";
import { LoginWall } from "@/components/members/login-wall";
import { EmptySpace } from "@/components/space/empty-space";
import { getNav, spaceOf } from "@/lib/content";
import { formatDate, getRecentDocs } from "@/lib/doc-info";
import { pageAccess } from "@/lib/wiki/server-viewer";

/**
 * 부원 공간 첫 화면 (/members). 요청마다 권한을 확인해서 그린다 — 정적 생성하지 않는다.
 * 손님에게는 로그인 벽만 보이고 부원 문서는 HTML 에 한 글자도 들어가지 않는다.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "부원 공간",
  robots: { index: false, follow: false },
};

const PER_CATEGORY = 5;

export default async function MembersHome() {
  const { viewer, canReadMembers } = await pageAccess();
  if (!canReadMembers) return <LoginWall next="/members" mode={viewer.authenticated ? "forbidden" : "login"} />;

  const space = spaceOf("members");
  const nav = getNav("members");
  const recent = getRecentDocs(6, "members");
  const categories = space?.categoryOrder() ?? [];

  return (
    <>
      <MembersBand />
      <PageBar crumbs={[{ label: "부원 공간" }]} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <div className="mx-auto w-full max-w-[960px] px-4 pt-6 pb-20 sm:px-8 sm:pt-10">
          <section className="max-w-[640px]">
            <p className="inline-flex items-center gap-1.5 text-[13px] font-bold tracking-[0.06em] text-lock">
              <LockIcon size={14} />
              부원만
            </p>
            <h1 className="mt-2 text-[30px] leading-tight font-bold tracking-[-0.01em] text-fg sm:text-[36px]">부원 공간</h1>
            <p className="mt-3 text-[16px] leading-relaxed text-fg-2 sm:text-[17px]">
              방송부 부원끼리 보는 운영 문서예요. 서버 PC·장비 절차, 인수인계, 회의 기록처럼 공개 가이드북에 올리지 않을 것을 여기에 써요.
            </p>
          </section>

          {!space ? (
            <p className="mt-10 rounded-xl border border-line bg-bg-soft px-5 py-6 text-[14px] text-fg-2">
              서버 설정 문제로 부원 공간을 열 수 없어요. 관리자에게 알려 주세요 (OFFAIR_DATA_DIR 위치).
            </p>
          ) : nav.length === 0 ? (
            <EmptySpace categories={categories} />
          ) : (
            <>
              <section aria-labelledby="mem-categories" className="mt-14">
                <h2 id="mem-categories" className="text-[13px] font-semibold tracking-[0.04em] text-fg-3">
                  카테고리
                </h2>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {nav.map((group) => {
                    const shown = group.items.slice(0, PER_CATEGORY);
                    return (
                      <li key={group.category} className="flex flex-col rounded-xl border border-line bg-bg p-4">
                        <div className="flex items-baseline gap-2">
                          <h3 className="text-[15px] font-bold text-fg">{group.category}</h3>
                          <span className="ml-auto text-xs text-fg-3">문서 {group.items.length}</span>
                        </div>
                        <ul className="mt-2.5 flex flex-col">
                          {shown.map((item) => (
                            <li key={item.url}>
                              <Link
                                href={item.url}
                                className="-mx-2 block truncate rounded-md px-2 py-1 text-[14px] text-fg-2 transition-colors hover:bg-hover hover:text-fg"
                              >
                                {item.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section aria-labelledby="mem-recent" className="mt-14">
                <h2 id="mem-recent" className="text-[13px] font-semibold tracking-[0.04em] text-fg-3">
                  최근 바뀐 문서
                </h2>
                <ul className="mt-3 divide-y divide-line-2 rounded-xl border border-line">
                  {recent.map((doc) => (
                    <li key={doc.url}>
                      <Link href={doc.url} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-soft">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-medium text-fg">{doc.title}</span>
                          <span className="block truncate text-[13px] text-fg-3">
                            {doc.category}
                            {doc.description && ` · ${doc.description}`}
                          </span>
                        </span>
                        {doc.updatedAt && (
                          <time dateTime={doc.updatedAt.toISOString()} className="flex-none text-xs text-fg-3">
                            {formatDate(doc.updatedAt)}
                          </time>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
