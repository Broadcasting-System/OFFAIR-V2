import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { CodeBlock } from "./copy-button";
import { Figure } from "./figure";

/* ───────────────────────── Callout / Tip block ───────────────────────── */

type CalloutType = "note" | "tip" | "warn" | "danger" | "info";

const CALLOUT: Record<
  CalloutType,
  { label: string; accent: string; bg: string; icon: React.ReactNode }
> = {
  note: {
    label: "NOTE",
    accent: "text-fg-muted border-line-strong",
    bg: "bg-ink-800/50",
    icon: <DotIcon />,
  },
  info: {
    label: "INFO",
    accent: "text-beam-400 border-beam-500/40",
    bg: "bg-beam-500/[0.06]",
    icon: <InfoIcon />,
  },
  tip: {
    label: "TIP",
    accent: "text-emerald-300 border-emerald-400/40",
    bg: "bg-emerald-400/[0.06]",
    icon: <BulbIcon />,
  },
  warn: {
    label: "주의",
    accent: "text-amber-300 border-amber-400/40",
    bg: "bg-amber-400/[0.06]",
    icon: <WarnIcon />,
  },
  danger: {
    label: "경고",
    accent: "text-rose-300 border-rose-400/40",
    bg: "bg-rose-400/[0.07]",
    icon: <WarnIcon />,
  },
};

function Callout({
  type = "note",
  title,
  children,
}: {
  type?: CalloutType;
  title?: string;
  children: React.ReactNode;
}) {
  const c = CALLOUT[type];
  return (
    <div
      className={`my-6 rounded-lg border ${c.accent} ${c.bg} px-4 py-3.5`}
      role="note"
    >
      <div className="flex items-center gap-2">
        <span className={c.accent.split(" ")[0]}>{c.icon}</span>
        <span
          className={`font-mono text-xs font-semibold uppercase tracking-wider ${
            c.accent.split(" ")[0]
          }`}
        >
          {title ?? c.label}
        </span>
      </div>
      <div className="mt-2 text-[0.95rem] leading-relaxed text-fg [&>*+*]:mt-2 [&_p]:m-0">
        {children}
      </div>
    </div>
  );
}

/* ───────────────────────── Steps (procedures) ───────────────────────── */

function Steps({ children }: { children: React.ReactNode }) {
  return (
    <div className="mdx-steps my-6 ml-3 border-l border-line pl-7 [counter-reset:step]">
      {children}
    </div>
  );
}

function Step({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative pb-7 last:pb-0 [counter-increment:step]">
      <span
        aria-hidden
        className="absolute -left-[3.05rem] flex size-7 items-center justify-center rounded-full border border-beam-500/50 bg-ink-900 font-display text-sm font-bold text-beam-300 before:content-[counter(step)]"
      />
      <h4 className="!mt-0 mb-1 font-semibold text-white">{title}</h4>
      <div className="text-[0.95rem] leading-relaxed text-fg-muted [&>*+*]:mt-2 [&_p]:m-0">
        {children}
      </div>
    </div>
  );
}

/* ───────────────────────── Cards (landing / link grid) ──────────────── */

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 grid gap-4 sm:grid-cols-2">{children}</div>
  );
}

function Card({
  href,
  title,
  children,
}: {
  href?: string;
  title: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <h4 className="!mt-0 font-semibold text-white">{title}</h4>
        {href && (
          <span className="text-beam-400 transition-transform group-hover:translate-x-0.5">
            →
          </span>
        )}
      </div>
      {children && (
        <div className="mt-1.5 text-sm leading-relaxed text-fg-muted [&_p]:m-0 [&_p]:text-fg-muted">
          {children}
        </div>
      )}
    </>
  );
  const cls =
    "group block rounded-lg border border-line bg-ink-850 p-4 transition-colors hover:border-beam-500/50 hover:bg-ink-800";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/* ───────────────────────── Inline helpers ───────────────────────── */

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.6em] items-center justify-center rounded border border-line-strong border-b-2 bg-ink-700 px-1.5 py-0.5 font-mono text-[0.78em] text-fg shadow-sm">
      {children}
    </kbd>
  );
}

function Badge({
  children,
  tone = "beam",
}: {
  children: React.ReactNode;
  tone?: "beam" | "muted" | "warn";
}) {
  const tones = {
    beam: "border-beam-500/40 text-beam-300 bg-beam-500/10",
    muted: "border-line-strong text-fg-muted bg-ink-800",
    warn: "border-amber-400/40 text-amber-300 bg-amber-400/10",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[0.7rem] font-medium uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* ───────────────────────── Base element overrides ───────────────────── */

function anchored(Tag: "h2" | "h3" | "h4") {
  return function Heading({
    id,
    children,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
      <Tag id={id} {...props} className="group/h scroll-mt-24">
        {id ? (
          <a
            href={`#${id}`}
            className="!border-0 no-underline"
            aria-label={`${String(children)} 섹션 링크`}
          >
            {children}
            <span className="ml-2 select-none text-beam-500 opacity-0 transition-opacity group-hover/h:opacity-100">
              #
            </span>
          </a>
        ) : (
          children
        )}
      </Tag>
    );
  };
}

function Anchor({
  href = "",
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const external = /^https?:\/\//.test(href);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}

function Table({ children }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="my-6 overflow-x-auto rounded-lg border border-line">
      <table>{children}</table>
    </div>
  );
}

export const mdxComponents: MDXComponents = {
  // custom blocks
  Callout,
  Steps,
  Step,
  Card,
  CardGrid,
  Kbd,
  Badge,
  Figure,
  // element overrides
  a: Anchor,
  h2: anchored("h2"),
  h3: anchored("h3"),
  h4: anchored("h4"),
  pre: CodeBlock,
  table: Table,
};

/* ───────────────────────── Icons ───────────────────────── */

function DotIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 11v5M12 8h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function BulbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.2 1 2.5h6c0-1.3.3-1.8 1-2.5A6 6 0 0 0 12 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3 2 20h20L12 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 9v5M12 17h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
