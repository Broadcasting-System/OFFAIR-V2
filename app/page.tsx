import Link from "next/link";
import { ArrowRightIcon } from "@/components/shell/icons";
import { EditFab } from "@/components/dev/edit-fab";
import { HomeSearch } from "@/components/home-search";
import { PageBar } from "@/components/shell/page-bar";
import { SiteFooter } from "@/components/site-footer";
import { EmptySpace } from "@/components/space/empty-space";
import { readGate } from "@/components/members/read-gate";
import { getCategoryOrder, getNav } from "@/lib/content";
import { formatDate, getRecentDocs } from "@/lib/doc-info";
import { getHomeConfig } from "@/lib/site";

const PER_CATEGORY = 4;

/** 가이드북 첫 화면. 부원 전용이라 요청마다 권한을 확인해서 그린다 (손님에게는 로그인 벽만) */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const wall = await readGate("/");
  if (wall) return wall;
  const nav = getNav();
  const recent = getRecentDocs(6);
  const { title, description, primaryCta, secondaryCta } = getHomeConfig();

  return (
    <>
      <PageBar crumbs={[{ label: "가이드북" }]} />

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <div className="mx-auto w-full max-w-[960px] px-4 pt-6 pb-20 sm:px-8 sm:pt-10">
          {/* 머리말 */}
          <section className="max-w-[640px]">
            {title && (
              <p className="text-[13px] font-bold tracking-[0.06em] text-accent">
                {title}
              </p>
            )}
            <h1 className="mt-2 text-[30px] leading-tight font-bold tracking-[-0.01em] text-fg sm:text-[36px]">
              방송부 가이드북
            </h1>
            {description && (
              <p className="mt-3 text-[16px] leading-relaxed text-fg-2 sm:text-[17px]">
                {description}
              </p>
            )}
            <div className="mt-6">
              <HomeSearch />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {primaryCta.label && (
                <Link
                  href={primaryCta.href || "#"}
                  className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
                >
                  {primaryCta.label}
                </Link>
              )}
              {secondaryCta.label && (
                <Link
                  href={secondaryCta.href || "#"}
                  className="inline-flex h-8 items-center rounded-md border border-line px-3 text-sm font-medium text-fg transition-colors hover:bg-hover"
                >
                  {secondaryCta.label}
                </Link>
              )}
            </div>
          </section>

          {nav.length === 0 && <EmptySpace categories={getCategoryOrder()} />}

          {/* 카테고리 */}
          {nav.length > 0 && (
            <section aria-labelledby="home-categories" className="mt-14">
              <h2
                id="home-categories"
                className="text-[13px] font-semibold tracking-[0.04em] text-fg-3"
              >
                카테고리
              </h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {nav.map((group) => {
                  const shown = group.items.slice(0, PER_CATEGORY);
                  const rest = group.items.length - shown.length;
                  return (
                    <li
                      key={group.category}
                      className="flex flex-col rounded-xl border border-line bg-bg p-4"
                    >
                      <div className="flex items-baseline gap-2">
                        <h3 className="text-[15px] font-bold text-fg">
                          {group.category}
                        </h3>
                        <span className="ml-auto text-xs text-fg-3">
                          문서 {group.items.length}
                        </span>
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
                      {rest > 0 && (
                        <Link
                          href={group.items[PER_CATEGORY].url}
                          className="mt-1.5 self-start rounded text-[13px] font-medium text-accent hover:underline"
                        >
                          외 {rest}개 더 보기{" "}
                          <ArrowRightIcon
                            size={13}
                            className="inline align-[-2px]"
                          />
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* 최근 바뀐 문서 */}
          {recent.length > 0 && (
            <section aria-labelledby="home-recent" className="mt-14">
              <div className="flex items-baseline">
                <h2
                  id="home-recent"
                  className="text-[13px] font-semibold tracking-[0.04em] text-fg-3"
                >
                  최근 바뀐 문서
                </h2>
                <Link
                  href="/recent"
                  className="ml-auto rounded text-[13px] font-medium text-accent hover:underline"
                >
                  전체 보기
                </Link>
              </div>
              <ul className="mt-3 divide-y divide-line-2 rounded-xl border border-line">
                {recent.map((doc) => (
                  <li key={doc.url}>
                    <Link
                      href={doc.url}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-soft"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium text-fg">
                          {doc.title}
                        </span>
                        <span className="block truncate text-[13px] text-fg-3">
                          {doc.category}
                          {doc.description && ` · ${doc.description}`}
                        </span>
                      </span>
                      {doc.updatedAt && (
                        <time
                          dateTime={doc.updatedAt.toISOString()}
                          className="flex-none text-xs text-fg-3"
                        >
                          {formatDate(doc.updatedAt)}
                        </time>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>

      <SiteFooter />
      <EditFab href="/edit/home" label="홈 수정" />
    </>
  );
}
