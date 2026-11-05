"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavGroup, SearchDoc } from "@/lib/content";
import { Logo, LogoMark } from "@/components/logo";
import { SearchDialog } from "@/components/search-dialog";
import { DocTree } from "./doc-tree";
import {
  ClockIcon,
  CloseIcon,
  LockIcon,
  MenuIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  TreeIcon,
  UserIcon,
} from "./icons";
import {
  OPEN_SEARCH_EVENT,
  toggleTheme,
  togglePanel,
  usePanelOpen,
  useTheme,
} from "./ui-prefs";

/**
 * 레이아웃 D(집중 읽기형)의 뼈대.
 *  - 데스크톱: 왼쪽 아이콘 레일(56px) + 문서 트리 서랍(280px) + 본문
 *  - 모바일(≤768px): 레일 대신 얇은 위 막대, 서랍은 왼쪽 시트
 */
export function AppShell({
  nav,
  searchIndex,
  children,
}: {
  nav: NavGroup[];
  searchIndex: SearchDoc[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const drawerOpen = usePanelOpen("drawer");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const docCount = nav.reduce((n, g) => n + g.items.length, 0);

  // 페이지가 바뀌면 모바일 시트는 닫는다 (렌더 중 상태 조정 패턴)
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setSheetOpen(false);
  }

  // ⌘K / Ctrl+K, 그리고 다른 곳(홈 검색창)에서 보내는 열기 신호
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    function onOpen() {
      setSearchOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  // 모바일 시트: 열려 있는 동안 스크롤 잠금 + Esc 로 닫기
  useEffect(() => {
    if (!sheetOpen) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  const recentActive = pathname === "/recent";
  const membersActive = pathname.startsWith("/members");

  return (
    <>
      <a href="#main" className="skip-link">
        본문으로 건너뛰기
      </a>

      <div className="shell">
        {/* ───────── 데스크톱: 아이콘 레일 ───────── */}
        <nav className="shell-rail" aria-label="주요 메뉴">
          <div className="flex h-full flex-col items-center gap-1.5 py-3">
            <Link
              href="/"
              aria-label="OFFAIR 홈"
              data-tip="홈"
              className="rail-tip mb-2 grid size-[38px] place-items-center rounded-[10px]"
            >
              <LogoMark />
            </Link>
            <RailButton
              label={drawerOpen ? "문서 트리 닫기" : "문서 트리 열기"}
              tip="문서 트리"
              active={drawerOpen}
              onClick={() => togglePanel("drawer")}
              aria-expanded={drawerOpen}
              aria-controls="doc-drawer"
            >
              <TreeIcon />
            </RailButton>
            <RailButton
              label="검색 (⌘K)"
              tip="검색 ⌘K"
              onClick={() => setSearchOpen(true)}
            >
              <SearchIcon />
            </RailButton>
            <RailLink
              href="/recent"
              label="최근 바뀐 문서"
              active={recentActive}
            >
              <ClockIcon />
            </RailLink>
            <RailLink
              href="/members"
              label="부원 공간 (부원만)"
              active={membersActive}
            >
              <LockIcon />
            </RailLink>
            <span className="flex-1" />
            <ThemeButton className="rail-tip" />
            <Link
              href="/members"
              aria-label="로그인 (준비 중)"
              data-tip="로그인"
              className="rail-tip mt-1 grid size-7 place-items-center rounded-full bg-hover text-fg-3 transition-colors hover:bg-line hover:text-fg"
            >
              <UserIcon size={16} />
            </Link>
          </div>
        </nav>

        {/* ───────── 모바일: 얇은 위 막대 ───────── */}
        <header className="shell-mtop">
          <Logo />
          <span className="flex-1" />
          <IconButton label="검색" onClick={() => setSearchOpen(true)}>
            <SearchIcon />
          </IconButton>
          <ThemeButton />
          <IconButton
            label={sheetOpen ? "문서 트리 닫기" : "문서 트리 열기"}
            onClick={() => setSheetOpen((v) => !v)}
            aria-expanded={sheetOpen}
            aria-controls="doc-drawer"
          >
            <MenuIcon />
          </IconButton>
        </header>

        {/* ───────── 문서 트리 서랍 ───────── */}
        <div
          className="shell-scrim"
          data-open={sheetOpen}
          onClick={() => setSheetOpen(false)}
          aria-hidden
        />
        <aside
          id="doc-drawer"
          className="shell-drawer"
          data-sheet={sheetOpen ? "open" : "closed"}
          aria-label="문서 트리"
        >
          <div className="px-2.5 pt-3.5 pb-6">
            <div className="flex items-center gap-2 px-2 pt-0.5 pb-1.5">
              <Link href="/" className="rounded text-[15px] font-bold text-fg">
                가이드북
              </Link>
              <span className="ml-auto text-xs text-fg-3">문서 {docCount}</span>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="문서 트리 닫기"
                className="-mr-1 grid size-8 place-items-center rounded-md text-fg-2 hover:bg-hover min-[769px]:hidden"
              >
                <CloseIcon />
              </button>
            </div>
            <DocTree nav={nav} onNavigate={() => setSheetOpen(false)} />
            <div className="mt-6 border-t border-line-2 px-2 pt-3 text-[13px] min-[769px]:hidden">
              <Link
                href="/recent"
                className="flex items-center gap-2 rounded-md py-1.5 text-fg-2"
              >
                <ClockIcon size={16} /> 최근 바뀐 문서
              </Link>
              <Link
                href="/members"
                className="flex items-center gap-2 rounded-md py-1.5 text-fg-2"
              >
                <LockIcon size={16} /> 부원 공간
                <span className="rounded bg-lock-bg px-1.5 text-[11px] font-semibold text-lock">
                  부원만
                </span>
              </Link>
            </div>
          </div>
        </aside>

        {/* ───────── 본문 ───────── */}
        <div className="shell-main">{children}</div>
      </div>

      <SearchDialog
        index={searchIndex}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </>
  );
}

const railBtn =
  "rail-tip grid size-[38px] place-items-center rounded-[10px] transition-colors";

function RailButton({
  label,
  tip,
  active = false,
  children,
  ...rest
}: {
  label: string;
  tip: string;
  active?: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={tip}
      className={`${railBtn} ${
        active ? "bg-sel text-accent" : "text-fg-2 hover:bg-hover"
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}

function RailLink({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      data-tip={label}
      aria-current={active ? "page" : undefined}
      className={`${railBtn} ${
        active ? "bg-sel text-accent" : "text-fg-2 hover:bg-hover"
      }`}
    >
      {children}
    </Link>
  );
}

function IconButton({
  label,
  children,
  ...rest
}: {
  label: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-9 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-hover"
      {...rest}
    >
      {children}
    </button>
  );
}

function ThemeButton({ className = "" }: { className?: string }) {
  const theme = useTheme();
  const label =
    theme === "dark" ? "밝은 화면으로 바꾸기" : "어두운 화면으로 바꾸기";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      data-tip={theme === "dark" ? "밝게" : "어둡게"}
      className={`grid size-9 place-items-center rounded-[10px] text-fg-2 transition-colors hover:bg-hover min-[769px]:size-[38px] ${className}`}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
