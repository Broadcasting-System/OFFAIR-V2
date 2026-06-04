import Image from "next/image";

/**
 * Fixed, dimmed background artwork shown behind the whole app (docs included).
 * Sits above the solid body color (-z-10) but below all content.
 * The hero renders its own full-strength image on top of this.
 */
export function SiteBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <Image
        src="/background.webp"
        alt=""
        fill
        sizes="100vw"
        className="object-cover object-center opacity-95"
        priority={false}
      />
      {/* light gradient only — keep the artwork clearly visible, text readable */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/30 via-transparent to-ink-950/60" />
    </div>
  );
}
