import Image from "next/image";
import Link from "next/link";
import { getHomeConfig } from "@/lib/site";

/**
 * OFFAIR hero — faithful to the provided main design (image 3):
 * full-bleed background.png, OFFAIR wordmark top-left, particle/hex artwork.
 * Copy is editable via `content/home.json` (edit mode). Layout kept intact.
 */
export function Hero() {
  const { eyebrow, title, description, primaryCta, secondaryCta } =
    getHomeConfig();

  return (
    <section className="relative isolate overflow-hidden border-b border-line">
      {/* background artwork */}
      <Image
        src="/background.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-10 object-cover object-center opacity-90"
      />
      <div className="absolute inset-0 -z-10 bg-grid" aria-hidden />
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-b from-ink-950/30 via-transparent to-ink-950"
        aria-hidden
      />

      <div className="mx-auto flex min-h-[clamp(20rem,52vh,32rem)] max-w-[90rem] flex-col justify-center px-5 py-16 sm:px-8 lg:px-12">
        {eyebrow && (
          <p className="mb-4 flex items-center gap-2.5 font-display text-[0.7rem] uppercase tracking-[0.3em] text-beam-300/90">
            <span className="size-1.5 animate-pulse rounded-full bg-beam-400 shadow-glow" />
            {eyebrow}
          </p>
        )}

        <h1 className="font-display text-[clamp(3rem,11vw,7rem)] font-extrabold leading-[0.92] tracking-[0.02em] text-white text-glow">
          {title}
        </h1>

        {description && (
          <p className="mt-5 max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
            {description}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {primaryCta.label && (
            <Link
              href={primaryCta.href || "#"}
              className="group inline-flex items-center gap-2 rounded-lg bg-beam-500 px-5 py-2.5 font-medium text-ink-950 transition-colors hover:bg-beam-400"
            >
              {primaryCta.label}
              <span className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          )}
          {secondaryCta.label && (
            <Link
              href={secondaryCta.href || "#"}
              className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-ink-900/60 px-5 py-2.5 font-medium text-fg backdrop-blur transition-colors hover:border-beam-500/50 hover:text-white"
            >
              {secondaryCta.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
