"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavGroup, SearchDoc } from "@/lib/content";
import { Logo } from "./logo";
import { SidebarNav } from "./sidebar-nav";
import { SearchDialog } from "./search-dialog";

const NAV_LINKS = [
  { href: "/docs/intro", label: "Docs", match: "/docs" },
  { href: "/contribution", label: "Contribution", match: "/contribution" },
];

export function SiteHeader({
  nav,
  searchIndex = [],
  devEdit = false,
}: {
  nav: NavGroup[];
  searchIndex?: SearchDoc[];
  devEdit?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  // ⌘K / Ctrl+K toggles search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line/80 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* mobile menu button */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="-ml-1 inline-flex size-9 items-center justify-center rounded-md border border-line text-fg-muted hover:text-white lg:hidden"
          aria-label="메뉴 열기"
          aria-expanded={open}
        >
          <BurgerIcon open={open} />
        </button>

        <Logo />

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => {
            const active = pathname.startsWith(l.match);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "text-white"
                    : "text-fg-muted hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {devEdit && (
            <Link
              href="/edit"
              className="hidden items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-sm font-medium text-amber-300 transition-colors hover:border-amber-400/70 sm:inline-flex"
              title="수정 모드 (dev only)"
            >
              ✎ Edit
            </Link>
          )}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden items-center gap-2 rounded-lg border border-line bg-ink-850 px-3 py-1.5 text-sm text-fg-faint transition-colors hover:border-line-strong sm:flex"
            aria-label="문서 검색"
          >
            <SearchIcon />
            <span>검색...</span>
            <kbd className="rounded border border-line-strong px-1.5 font-mono text-[0.7rem] text-fg-muted">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-md border border-line text-fg-muted hover:text-white sm:hidden"
            aria-label="문서 검색"
          >
            <SearchIcon />
          </button>
          <a
            href="https://github.com/Broadcasting-System/OFFAIR-V2"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex size-9 items-center justify-center rounded-md border border-line text-fg-muted transition-colors hover:border-line-strong hover:text-white"
            aria-label="GitHub"
          >
            <GitHubIcon />
          </a>
        </div>
      </div>
      </header>

      {/* Mobile full-screen menu — fills the viewport, closes on selection */}
      <div
        className={`fixed inset-0 top-16 z-40 overflow-y-auto overscroll-contain bg-ink-950 transition-[opacity,transform] duration-200 lg:hidden ${
          open
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0"
        }`}
        aria-hidden={!open}
        onClick={(e) => {
          // close when any link inside is tapped (even same-page links)
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        <div className="mx-auto max-w-2xl px-5 py-6">
          <div className="mb-5 flex gap-2">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md border border-line px-3 py-1.5 text-sm text-fg-muted hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </div>
          <SidebarNav nav={nav} />
        </div>
      </div>

      <SearchDialog
        index={searchIndex}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </>
  );
}

function BurgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      {open ? (
        <path
          d="M6 6l12 12M18 6L6 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M4 7h16M4 12h16M4 17h16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path
        d="m20 20-3-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.66-.22.66-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.16.58.67.48A10 10 0 0 0 22 12c0-5.52-4.48-10-10-10Z" />
    </svg>
  );
}
