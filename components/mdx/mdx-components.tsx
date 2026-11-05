import type { MDXComponents } from "mdx/types";
import { ArrowRightIcon } from "@/components/shell/icons";
import Link from "next/link";
import { CodeBlock } from "./copy-button";
import { Figure } from "./figure";

/* ───────────────────────── Callout / Tip block ───────────────────────── */

type CalloutType = "note" | "tip" | "warn" | "danger" | "info";

/** 부드러운 색 배경 + 8px 둥근 모서리. 굵은 테두리 없음. */
const CALLOUT: Record<
  CalloutType,
  { label: string; box: string; tone: string; icon: React.ReactNode }
> = {
  note: { label: "참고", box: "bg-bg-soft", tone: "text-fg-2", icon: <NoteIcon /> },
  info: { label: "알아두기", box: "bg-accent-soft", tone: "text-accent", icon: <InfoIcon /> },
  tip: { label: "팁", box: "bg-ok-bg", tone: "text-ok", icon: <BulbIcon /> },
  warn: { label: "주의", box: "bg-warn-bg", tone: "text-warn", icon: <WarnIcon /> },
  danger: { label: "경고", box: "bg-del-bg", tone: "text-del", icon: <WarnIcon /> },
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
  const c = CALLOUT[type] ?? CALLOUT.note;
  return (
    <div
      className={`my-5 flex gap-2.5 rounded-lg px-3.5 py-3 text-[15.5px] leading-relaxed ${c.box}`}
      role="note"
    >
      <span className={`mt-[3px] ${c.tone}`}>{c.icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`!mt-0 font-bold ${c.tone}`}>{title ?? c.label}</p>
        <div className="mt-0.5 text-fg [&>*+*]:mt-2 [&_p]:m-0">{children}</div>
      </div>
    </div>
  );
}

/* ───────────────────────── Steps (procedures) ───────────────────────── */

function Steps({ children }: { children: React.ReactNode }) {
  return <div className="my-6 [counter-reset:step]">{children}</div>;
}

function Step({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative pb-6 pl-10 [counter-increment:step] last:pb-0 before:absolute before:top-8 before:bottom-1.5 before:left-[13px] before:w-px before:bg-line-2 last:before:hidden">
      <span
        aria-hidden
        className="absolute top-0 left-0 grid size-[27px] place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-accent before:content-[counter(step)]"
      />
      <h4 className="!mt-0 text-[17px] leading-[27px] font-semibold text-fg">
        {title}
      </h4>
      <div className="mt-1 text-[16px] leading-relaxed text-fg-2 [&>*+*]:mt-2 [&_p]:m-0">
        {children}
      </div>
    </div>
  );
}

/* ───────────────────────── Cards (link grid) ──────────────── */

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="my-6 grid gap-3 sm:grid-cols-2">{children}</div>;
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
      <span className="flex items-center justify-between gap-2">
        <span className="text-[15.5px] font-semibold text-fg group-hover:text-accent">
          {title}
        </span>
        {href && (
          <span
            aria-hidden
            className="text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
          >
            <ArrowRightIcon size={16} />
          </span>
        )}
      </span>
      {children && (
        <span className="mt-1 block text-[14px] leading-relaxed text-fg-2 [&_p]:m-0">
          {children}
        </span>
      )}
    </>
  );
  const cls =
    "group block rounded-[10px] border border-line bg-bg px-4 py-3.5 !no-underline transition-colors hover:border-accent hover:bg-bg-soft";
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
    <kbd className="inline-flex min-w-[1.6em] items-center justify-center rounded-[5px] border border-b-2 border-line bg-bg-soft px-1.5 py-px font-sans text-[0.8em] font-medium text-fg">
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
    beam: "bg-accent-soft text-accent",
    muted: "bg-hover text-fg-2",
    warn: "bg-warn-bg text-warn",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-px align-[0.1em] text-[0.75em] font-semibold ${tones[tone] ?? tones.beam}`}
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
      <Tag id={id} {...props} className="group/h relative">
        {children}
        {id && (
          <a
            href={`#${id}`}
            className="ml-2 inline-block rounded px-1 text-fg-3 !no-underline opacity-0 transition-opacity group-hover/h:opacity-100 focus-visible:opacity-100"
            aria-label="이 제목 링크"
          >
            #
          </a>
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
  if (href.startsWith("#")) {
    return (
      <a href={href} {...props}>
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
    <div className="my-5 overflow-x-auto rounded-lg border border-line">
      <table className="mdx-table">{children}</table>
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

function NoteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3h7l5 5v13H7z M14 3v5h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
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
