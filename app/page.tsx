import Link from "next/link";
import { Hero } from "@/components/hero";
import { EditFab } from "@/components/dev/edit-fab";
import { getNav } from "@/lib/content";

export default function HomePage() {
  const nav = getNav();

  return (
    <>
      <Hero />

      <section className="mx-auto max-w-[90rem] px-5 py-16 sm:px-8 lg:px-12">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 font-display text-[0.7rem] uppercase tracking-[0.28em] text-beam-400">
              Index
            </p>
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
              가이드북 둘러보기
            </h2>
          </div>
          <Link
            href="/docs/intro"
            className="hidden whitespace-nowrap text-sm text-fg-muted transition-colors hover:text-beam-300 sm:block"
          >
            전체 문서 →
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {nav.map((group) => (
            <div
              key={group.category}
              className="hud-frame rounded-xl border border-line bg-ink-900/60 p-6 transition-colors hover:border-line-strong"
            >
              <h3 className="font-display text-sm font-bold uppercase tracking-[0.14em] text-beam-300">
                {group.category}
              </h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {group.items.map((item) => (
                  <li key={item.url}>
                    <Link
                      href={item.url}
                      className="group flex items-baseline gap-2 text-fg-muted transition-colors hover:text-white"
                    >
                      <span className="mt-2 size-1 shrink-0 rotate-45 bg-line-strong transition-colors group-hover:bg-beam-400" />
                      <span>
                        <span className="text-[0.95rem]">{item.title}</span>
                        {item.description && (
                          <span className="block text-xs text-fg-faint">
                            {item.description}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <EditFab href="/edit/home" label="홈 수정" />
    </>
  );
}
