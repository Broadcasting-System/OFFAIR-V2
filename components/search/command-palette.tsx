"use client";

import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createDoc, useTree } from "@/components/manage/tree-ops";
import {
  ContrastIcon,
  DocIcon,
  EnterIcon,
  HistoryIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
} from "@/components/shell/icons";
import { toggleTheme, useTheme } from "@/components/shell/ui-prefs";
import { api, canEditNow, isTypingTarget, toggleHistory, useMe } from "@/lib/wiki/client";
import { docFromPath, editHref, SPACE_LABEL, type SpaceKey } from "@/lib/wiki/links";
import { highlight, queryTokens, trimSnippet, type RecentDoc } from "@/lib/wiki/search-text";
import { keyOf } from "@/lib/wiki/tree-math";
import { recentDocs, recentQueries, rememberQuery } from "./recent";

/**
 * 명령 팔레트 (시안 f4 "D + A"): ⌘K · 레일 검색 · 홈 검색 칸으로 연다.
 *  - 비었을 때: 최근 본 문서 · 할 일 · 최근 찾은 말
 *  - 쓰는 중: 제목·소제목·본문 전체 검색 결과 (경로, 본문 조각 형광펜, 공간 칩과 개수)
 *  - `>` 로 시작하면 할 일만
 * 할 일 단축키(E·N·⇧D·H)는 팔레트를 닫은 채 글 칸 밖에서도 먹는다.
 * 모바일에서는 화면을 다 덮는 시트.
 */

interface Hit {
  space: SpaceKey;
  url: string;
  title: string;
  category: string;
  description: string;
  snippet: string;
  heading: string | null;
  score: number;
}

interface ApiResult {
  url: string;
  /** 사이트 안 경로 (url 은 OFFAIR_PUBLIC_URL 이 있으면 절대 주소) */
  path?: string;
  title: string;
  category: string;
  description: string;
  snippet?: string;
  heading?: string | null;
  score: number;
}

interface Action {
  id: string;
  title: string;
  hint?: string;
  icon: React.ReactNode;
  kbd: string;
  run: () => void;
}

type Item =
  | { kind: "doc"; id: string; hit: Hit | RecentDoc }
  | { kind: "action"; id: string; action: Action }
  | { kind: "query"; id: string; q: string };

type Chip = "all" | SpaceKey;

/**
 * 두 공간 모두 부원 전용이라 검색은 언제나 서버(/api/wiki/<space>/search, 권한 확인)로만 한다.
 * 읽을 수 없는 사람에게는 결과 대신 "부원만 찾을 수 있어요".
 */
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const theme = useTheme();
  const { groups } = useTree();
  const editable = canEditNow(me);
  const here = useMemo(() => docFromPath(pathname), [pathname]);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [chip, setChip] = useState<Chip>("all");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<{ docs: RecentDoc[]; queries: string[] }>({ docs: [], queries: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const actionMode = query.trimStart().startsWith(">");
  const searchText = actionMode ? "" : query.trim();

  // 열릴 때마다 처음 상태로 (렌더 중 상태 조정 패턴)
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActive(0);
      setChip("all");
      setHits(null);
      setRecent({ docs: recentDocs(), queries: recentQueries() });
    }
  }

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, [open]);

  /* ───────────── 검색 (잠깐 멈춘 뒤 서버로) ───────────── */
  const readMembers = !!me?.canReadMembers;
  useEffect(() => {
    if (!open || !searchText || !readMembers) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      const spaces: SpaceKey[] = ["guide", "members"];
      const parts = await Promise.all(
        spaces.map(async (s) => {
          try {
            const r = await api<{ results: ApiResult[] }>(`/api/wiki/${s}/search?limit=20&q=${encodeURIComponent(searchText)}`, { signal: ctl.signal });
            return r.results.map(
              (x): Hit => ({
                space: s,
                url: x.path ?? x.url,
                title: x.title,
                category: x.category,
                description: x.description,
                snippet: x.snippet || x.description,
                heading: x.heading ?? null,
                score: x.score,
              })
            );
          } catch (e) {
            if ((e as Error).name === "AbortError") throw e;
            return [];
          }
        })
      ).catch(() => null);
      if (!parts || ctl.signal.aborted) return;
      setHits(parts.flat().sort((a, b) => b.score - a.score));
      setLoading(false);
    }, 140);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [open, searchText, readMembers]);

  /* ───────────── 할 일 ───────────── */
  const nav = useMemo(
    () => ({ push: (h: string) => router.push(h), replace: (h: string) => router.replace(h), refresh: () => router.refresh() }),
    [router]
  );
  const hereTitle = findHere(groups, here);

  const actions: Action[] = (() => {
    const list: Action[] = [];
    if (editable && here) {
      list.push({ id: "edit", title: "이 문서 편집", icon: <PencilIcon size={16} />, kbd: "E", run: () => router.push(editHref(here.space, here.slug)) });
    }
    if (editable) {
      list.push({
        id: "new",
        title: "새 문서",
        hint: hereTitle ? `${hereTitle.title} 아래에` : undefined,
        icon: <PlusIcon size={16} />,
        kbd: "N",
        run: () =>
          void createDoc(
            nav,
            hereTitle && here
              ? { category: hereTitle.category, parent: here.slug }
              : { category: groups?.[0]?.category ?? "문서" }
          ),
      });
    }
    list.push({
      id: "theme",
      title: theme === "dark" ? "라이트 모드로" : "다크 모드로",
      icon: <ContrastIcon size={16} />,
      kbd: "⇧D",
      run: toggleTheme,
    });
    if (here) {
      list.push({ id: "history", title: "이 문서 수정 기록", icon: <HistoryIcon size={16} />, kbd: "H", run: () => toggleHistory(true) });
    }
    return list;
  })();

  // 팔레트를 닫은 채로 쓰는 한 글자 단축키
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (open || e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"]:not([data-open="false"]), [role="menu"]')) return;
      const id = e.shiftKey ? (e.key === "D" || e.key === "d" ? "theme" : null) : ({ e: "edit", n: "new", h: "history" } as Record<string, string>)[e.key.toLowerCase()];
      const a = id && actionsRef.current.find((x) => x.id === id);
      if (a) {
        e.preventDefault();
        a.run();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /* ───────────── 목록 ───────────── */
  const counts = useMemo(() => {
    const c = { all: 0, guide: 0, members: 0 };
    for (const h of hits ?? []) {
      c.all++;
      c[h.space]++;
    }
    return c;
  }, [hits]);

  const sections: { label?: string; items: Item[] }[] = useMemo(() => {
    if (actionMode) {
      const f = query.trimStart().slice(1).trim().toLowerCase();
      return [{ label: "할 일", items: actions.filter((a) => !f || a.title.toLowerCase().includes(f)).map((a) => ({ kind: "action", id: a.id, action: a })) }];
    }
    if (!searchText) {
      const docs = readMembers ? recent.docs.slice(0, 5) : [];
      return [
        { label: "최근 본 문서", items: docs.map((d) => ({ kind: "doc" as const, id: `r:${d.url}`, hit: d })) },
        { label: "할 일", items: actions.map((a) => ({ kind: "action" as const, id: a.id, action: a })) },
        { label: "최근 찾은 말", items: recent.queries.slice(0, 3).map((q) => ({ kind: "query" as const, id: `q:${q}`, q })) },
      ].filter((s) => s.items.length > 0);
    }
    const list = (hits ?? []).filter((h) => chip === "all" || h.space === chip).slice(0, 30);
    return [{ items: list.map((h) => ({ kind: "doc" as const, id: `${h.space}:${h.url}`, hit: h })) }];
  }, [actionMode, query, actions, searchText, recent, hits, chip, readMembers]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const activeIdx = Math.min(active, Math.max(0, flat.length - 1));

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  function runItem(item: Item, newTab = false) {
    if (item.kind === "query") {
      setQuery(item.q);
      setActive(0);
      inputRef.current?.focus();
      return;
    }
    if (item.kind === "action") {
      onClose();
      item.action.run();
      return;
    }
    if (searchText) rememberQuery(searchText);
    if (newTab) {
      window.open(item.hit.url, "_blank", "noopener");
      return;
    }
    onClose();
    router.push(item.hit.url);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIdx + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIdx - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = flat[activeIdx];
      if (it) runItem(it, e.metaKey || e.ctrlKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  // 닫힌 동안에도 마운트해 두어 한 글자 단축키를 듣는다 (⌘K 는 앱 뼈대가 듣는다)
  if (!open) return null;

  const tokens = queryTokens(searchText);
  const showChips = !!searchText && !actionMode && readMembers;
  let idx = -1;

  return (
    <div className="palette-root fixed inset-0 z-[100] flex items-start justify-center" role="dialog" aria-modal aria-label="검색과 할 일">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div className="palette relative flex w-full max-w-[660px] flex-col overflow-hidden bg-bg shadow-[0_20px_60px_rgba(0,0,0,0.35)]" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-3.5">
          <SearchIcon size={18} className="text-fg-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={flat[activeIdx] ? `pal-${activeIdx}` : undefined}
            aria-autocomplete="list"
            placeholder="문서를 찾거나 할 일을 쓰세요…"
            aria-label="검색어 또는 할 일"
            className="min-w-0 flex-1 bg-transparent text-[17px] text-fg outline-none placeholder:text-fg-3"
          />
          <kbd className="palette-kbd hidden rounded border border-line bg-bg px-[5px] py-px text-[11px] text-fg-3 sm:inline">{query ? "esc" : "⌘K"}</kbd>
          <button type="button" onClick={onClose} className="rounded px-1 text-[14px] font-medium text-accent sm:hidden">
            닫기
          </button>
        </div>

        {showChips && (
          <div className="flex gap-1.5 overflow-x-auto border-b border-line-2 px-[18px] py-2.5" role="tablist" aria-label="공간 고르기">
            {(["all", "guide", "members"] as Chip[]).map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={chip === c}
                onClick={() => {
                  setChip(c);
                  setActive(0);
                  inputRef.current?.focus();
                }}
                className={`flex-none rounded-full border px-2.5 py-1 text-[12.5px] ${
                  chip === c ? "border-transparent bg-accent-soft font-semibold text-accent" : "border-line text-fg-2 hover:bg-hover"
                }`}
              >
                {c === "all" ? "전체" : SPACE_LABEL[c]} {hits ? counts[c] : "…"}
              </button>
            ))}
          </div>
        )}

        <div ref={listRef} id="palette-list" role="listbox" aria-label="결과" className="palette-list overflow-y-auto p-1.5">
          {sections.map((s, si) => (
            <Fragment key={s.label ?? si}>
              {s.label && <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-[0.06em] text-fg-3">{s.label}</div>}
              {s.items.map((item) => {
                idx++;
                const i = idx;
                const on = i === activeIdx;
                return (
                  <div
                    key={item.id}
                    id={`pal-${i}`}
                    data-idx={i}
                    role="option"
                    aria-selected={on}
                    onMouseMove={() => active !== i && setActive(i)}
                    onClick={(e) => runItem(item, e.metaKey || e.ctrlKey)}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-[9px] ${on ? "bg-sel" : ""}`}
                  >
                    <ItemRow item={item} tokens={tokens} q={searchText} on={on} />
                  </div>
                );
              })}
            </Fragment>
          ))}
          {searchText && !readMembers && <p className="px-3 py-8 text-center text-[14px] text-fg-3">부원만 찾을 수 있어요</p>}
          {searchText && readMembers && hits && flat.length === 0 && (
            <p className="px-3 py-8 text-center text-[14px] text-fg-3">「{searchText}」 와 맞는 문서가 없어요</p>
          )}
          {searchText && readMembers && !hits && <p className="px-3 py-8 text-center text-[14px] text-fg-3">찾는 중…</p>}
          {actionMode && flat.length === 0 && <p className="px-3 py-8 text-center text-[14px] text-fg-3">맞는 할 일이 없어요</p>}
        </div>

        <div className="hidden items-center gap-3.5 border-t border-line px-[18px] py-[9px] text-[12px] text-fg-3 sm:flex">
          <span>↑↓ 이동</span>
          {searchText ? (
            <>
              <span>↵ 열기</span>
              <span>⌘↵ 새 창</span>
              <span className="ml-auto">{loading ? "찾는 중…" : "제목·소제목·본문을 찾아요"}</span>
            </>
          ) : (
            <>
              <span>↵ 실행</span>
              <span>&gt; 를 쓰면 할 일만</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 지금 보는 문서의 제목·카테고리 (트리에서) */
function findHere(groups: { category: string; items: { slug: string[]; title: string }[] }[] | null, here: { space: SpaceKey; slug: string[] } | null) {
  if (!here || here.space !== "guide") return null;
  const key = here.slug.join("/");
  for (const g of groups ?? []) {
    const d = g.items.find((x) => keyOf(x) === key);
    if (d) return { title: d.title, category: g.category };
  }
  return null;
}

function Marked({ text, tokens }: { text: string; tokens: string[] }) {
  return (
    <>
      {highlight(text, tokens).map((s, i) =>
        s.mark ? (
          <mark key={i} className="rounded-[2px] bg-[var(--mark)] px-px text-[inherit]">
            {s.text}
          </mark>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        )
      )}
    </>
  );
}

function ItemRow({ item, tokens, q, on }: { item: Item; tokens: string[]; q: string; on: boolean }) {
  const iconBox = "grid size-[30px] flex-none place-items-center rounded-[7px] bg-hover text-fg-2";
  const ret = on ? (
    <span className="ml-auto self-center text-fg-3" aria-hidden>
      <EnterIcon size={14} />
    </span>
  ) : null;

  if (item.kind === "query") {
    return (
      <>
        <span className={iconBox}>
          <SearchIcon size={15} />
        </span>
        <span className="min-w-0 flex-1 self-center truncate text-[14.5px] font-medium text-fg">{item.q}</span>
        {ret}
      </>
    );
  }
  if (item.kind === "action") {
    const a = item.action;
    return (
      <>
        <span className={iconBox}>{a.icon}</span>
        <span className="min-w-0 flex-1 self-center">
          <b className="text-[14.5px] font-semibold text-fg">{a.title}</b>
          {a.hint && <span className="ml-1.5 text-[12px] text-fg-3">{a.hint}</span>}
        </span>
        <kbd className="ml-auto self-center rounded border border-line bg-bg px-[5px] py-px text-[11px] text-fg-3">{a.kbd}</kbd>
      </>
    );
  }
  const h = item.hit;
  const isHit = "snippet" in h;
  const snippet = isHit ? trimSnippet(h.snippet, q, 140) : "";
  return (
    <>
      <span className={iconBox}>
        <DocIcon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <b className="text-[14.5px] font-semibold text-fg">
            <Marked text={h.title} tokens={tokens} />
          </b>
          <span className="text-[12px] text-fg-3">
            {SPACE_LABEL[h.space]}
            {h.category ? ` › ${h.category}` : ""}
          </span>
        </span>
        {isHit && snippet && (
          <span className="mt-[3px] line-clamp-2 block text-[13px] leading-[1.55] text-fg-2">
            <Marked text={snippet} tokens={tokens} />
          </span>
        )}
      </span>
      {ret}
    </>
  );
}
