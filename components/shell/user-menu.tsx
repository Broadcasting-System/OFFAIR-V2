"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRightIcon,
  ClockIcon,
  CommentIcon,
  LoginIcon,
  LogoutIcon,
  MonitorIcon,
  MoonIcon,
  PencilIcon,
  SunIcon,
} from "./icons";
import { setThemeMode, useThemeMode, type ThemeMode } from "./ui-prefs";
import { listDrafts, hhmm, type DraftEntry } from "@/lib/editor/draft";
import { api, useMe, type Me } from "@/lib/wiki/client";
import { LOGOUT_HREF, SPACE_LABEL, editHref, loginHref, type SpaceKey } from "@/lib/wiki/links";
import { dayLabel } from "@/lib/wiki/time";

/**
 * 레일 아래 아바타 → 내 메뉴 (시안 f8-D).
 * 이름 · 기수·역할 / 초안 · 댓글 · 수정한 문서 / 테마 · 로그아웃.
 * 로그인하지 않았으면 아바타 대신 로그인 단추.
 */

const ROLE_LABEL: Record<string, string> = {
  superadmin: "최고 관리자",
  lead: "부장",
  member: "부원",
  alumni: "졸업생",
  teacher: "선생님",
  guest: "손님",
};

const THEME_LABEL: Record<ThemeMode, string> = { system: "기기 따라가기", light: "라이트", dark: "다크" };
const THEME_NEXT: Record<ThemeMode, ThemeMode> = { system: "light", light: "dark", dark: "system" };

interface Mention {
  id: string;
  space: SpaceKey;
  url: string;
  title: string;
  author: { name: string };
  body: string;
  createdAt: string;
}
interface Edit {
  space: SpaceKey;
  url: string;
  title: string;
  date: string;
}

type Panel = "drafts" | "mentions" | "edits" | null;

export function initials(name: string): string {
  return (name || "?").replace(/\s+/g, "").slice(0, 2);
}

export function UserMenu({ placement }: { placement: "rail" | "top" }) {
  const me = useMe();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  if (!me) return <span className="size-7" aria-hidden />;
  if (!me.authenticated) {
    return (
      <a
        href={loginHref(pathname)}
        aria-label="로그인"
        data-tip="로그인"
        className={`grid place-items-center rounded-[10px] text-fg-2 transition-colors hover:bg-hover ${placement === "rail" ? "rail-tip size-[38px]" : "size-9"}`}
      >
        <LoginIcon size={18} />
      </a>
    );
  }
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`내 메뉴 (${me.name})`}
        className={`grid size-7 flex-none place-items-center rounded-full bg-avatar text-[10px] font-bold text-avatar-fg ${placement === "rail" ? "mt-1" : "mx-1"} ${open ? "ring-2 ring-accent ring-offset-2 ring-offset-bg" : ""}`}
      >
        {initials(me.name)}
      </button>
      {open && <MenuPop me={me} placement={placement} anchor={btnRef} onClose={() => setOpen(false)} />}
    </>
  );
}

function MenuPop({ me, placement, anchor, onClose }: { me: Me; placement: "rail" | "top"; anchor: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mode = useThemeMode() ?? "system";
  const [panel, setPanel] = useState<Panel>(null);
  const [drafts] = useState<DraftEntry[]>(() => listDrafts());
  const [act, setAct] = useState<{ mentions: Mention[]; edits: Edit[] } | null>(null);
  const [actError, setActError] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    api<{ mentions: Mention[]; edits: Edit[] }>("/api/me/activity", { signal: ctl.signal }).then(setAct, (e) => {
      if ((e as Error).name !== "AbortError") setActError(true);
    });
    return () => ctl.abort();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!boxRef.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        anchor.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  const sub = [me.cohort ? `${me.cohort}기` : null, me.roleLabel || ROLE_LABEL[me.role] || me.role, "ONAIR 로 로그인"].filter(Boolean).join(" · ");
  const pos = placement === "rail" ? "fixed bottom-3.5 left-[64px]" : "fixed top-[56px] right-2";
  const row = "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13.5px] text-fg-2 hover:bg-hover";
  const count = (n: number | null) => (n === null ? "" : String(n));

  const themeIcon = mode === "dark" ? <MoonIcon size={17} /> : mode === "light" ? <SunIcon size={17} /> : <MonitorIcon size={17} />;

  return createPortal(
    <div ref={boxRef} role="menu" aria-label="내 메뉴" className={`pop-menu ${pos} z-[90] w-[280px] max-w-[calc(100vw-16px)]`}>
      <div className="mb-1.5 flex items-center gap-2.5 border-b border-line-2 px-2 pt-2 pb-3">
        <span aria-hidden className="grid size-8 flex-none place-items-center rounded-full bg-avatar text-[11px] font-bold text-avatar-fg">
          {initials(me.name)}
        </span>
        <span className="min-w-0">
          <b className="block truncate text-[14px] text-fg">{me.name}</b>
          <small className="block truncate text-[12px] text-fg-3">{sub}</small>
        </span>
      </div>

      <MenuRow icon={<PencilIcon size={17} />} label="초안" right={count(drafts.length)} open={panel === "drafts"} onClick={() => setPanel(panel === "drafts" ? null : "drafts")} />
      {panel === "drafts" && (
        <SubList empty="이 브라우저에 남은 초안이 없어요">
          {drafts.map((d) => (
            <SubLink key={`${d.space}:${d.path}`} href={editHref(d.space as SpaceKey, d.path.split("/"))} onClick={onClose} title={d.title} meta={`${SPACE_LABEL[d.space as SpaceKey] ?? d.space} · ${hhmm(d.savedAt)} 저장`} />
          ))}
        </SubList>
      )}
      <MenuRow
        icon={<CommentIcon size={17} />}
        label="댓글"
        right={act ? count(act.mentions.length) : ""}
        open={panel === "mentions"}
        onClick={() => setPanel(panel === "mentions" ? null : "mentions")}
      />
      {panel === "mentions" && (
        <SubList empty={actError ? "불러오지 못했어요" : act ? "댓글이 없어요" : "불러오는 중…"}>
          {(act?.mentions ?? []).map((m) => (
            <SubLink key={m.id} href={m.url} onClick={onClose} title={`${m.author.name}: ${m.body}`} meta={`${m.title} · ${dayLabel(new Date(m.createdAt))}`} />
          ))}
        </SubList>
      )}
      <MenuRow icon={<ClockIcon size={17} />} label="수정한 문서" right="" open={panel === "edits"} onClick={() => setPanel(panel === "edits" ? null : "edits")} />
      {panel === "edits" && (
        <SubList empty={actError ? "불러오지 못했어요" : act ? "수정한 문서가 아직 없어요" : "불러오는 중…"}>
          {(act?.edits ?? []).map((e) => (
            <SubLink key={`${e.space}:${e.url}`} href={e.url} onClick={onClose} title={e.title} meta={`${SPACE_LABEL[e.space]} · ${dayLabel(new Date(e.date))}`} />
          ))}
        </SubList>
      )}

      <hr className="mx-1 my-1.5 border-line-2" />
      <button type="button" role="menuitem" className={row} onClick={() => setThemeMode(THEME_NEXT[mode])} aria-label={`테마: ${THEME_LABEL[mode]} (누르면 ${THEME_LABEL[THEME_NEXT[mode]]})`}>
        {themeIcon}
        <span className="flex-1">테마</span>
        <span className="text-[12px] text-fg-3">{THEME_LABEL[mode]}</span>
      </button>
      <a role="menuitem" href={LOGOUT_HREF} className={row}>
        <LogoutIcon size={17} />
        <span className="flex-1">로그아웃</span>
      </a>
    </div>,
    document.body
  );
}

function MenuRow({ icon, label, right, open, onClick }: { icon: React.ReactNode; label: string; right: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-expanded={open}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13.5px] hover:bg-hover ${open ? "bg-hover text-fg" : "text-fg-2"}`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {right && <span className="text-[12px] text-fg-3">{right}</span>}
      <ChevronRightIcon size={14} className={`text-fg-3 transition-transform ${open ? "rotate-90" : ""}`} />
    </button>
  );
}

function SubList({ empty, children }: { empty: string; children: React.ReactNode[] }) {
  return (
    <div className="mb-1 ml-[30px] max-h-[220px] overflow-y-auto border-l border-line-2 pl-2">
      {children.length ? children : <p className="px-2 py-1.5 text-[12.5px] text-fg-3">{empty}</p>}
    </div>
  );
}

function SubLink({ href, title, meta, onClick }: { href: string; title: string; meta: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="block rounded-md px-2 py-1.5 hover:bg-hover">
      <span className="block truncate text-[13px] text-fg">{title}</span>
      <span className="block truncate text-[11.5px] text-fg-3">{meta}</span>
    </Link>
  );
}
