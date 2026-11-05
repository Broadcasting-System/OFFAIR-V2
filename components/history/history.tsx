"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, useTransition } from "react";
import { CloseIcon, HistoryIcon, RestoreIcon } from "@/components/shell/icons";
import { isMobileViewport } from "@/components/shell/ui-prefs";
import { toast } from "@/components/ui/toast";
import { compareRevision } from "@/lib/wiki/compare-action";
import { api, ApiError, canEditNow, HISTORY_EVENT, useMe } from "@/lib/wiki/client";
import { apiSlug, josa, type SpaceKey } from "@/lib/wiki/links";
import { dayLabel, hm, whenLabel } from "@/lib/wiki/time";
import { Avatar } from "@/components/ui/avatar";

/**
 * 수정 기록 · 되돌리기 (시안 f6-A "본문에서 바로").
 *  - 위 막대 "기록" 버튼(또는 명령 팔레트 H)으로 오른쪽 패널(모바일: 아래 시트)을 연다.
 *  - 버전을 고르면 본문 칼럼에 "그 버전 뒤로 바뀐 곳"을 표시한 지금 문서가 나온다.
 *  - 노란 배너의 "이 때로 되돌리기"는 편집할 수 있는 사람만. 화면 안에서 한 번 더 묻는다.
 *  - 패널을 닫으면(데스크톱) 원래 화면으로.
 */

export interface HistoryEntry {
  rev: string;
  shortRev: string;
  author: string;
  date: string;
  message: string;
  body?: string;
  status: string;
  added?: number;
  removed?: number;
}

interface Compare {
  entry: HistoryEntry;
  node: React.ReactNode | null;
  error: string | null;
  same: boolean;
}

interface Ctx {
  open: boolean;
  setOpen: (v: boolean) => void;
  entries: HistoryEntry[] | null;
  loadError: string | null;
  compare: Compare | null;
  pending: boolean;
  select: (e: HistoryEntry, index: number) => void;
  clear: () => void;
  revert: () => Promise<void>;
}

const HistoryCtx = createContext<Ctx | null>(null);

function useHistory(): Ctx {
  const c = useContext(HistoryCtx);
  if (!c) throw new Error("HistoryProvider 안에서만 쓸 수 있어요");
  return c;
}

/* ───────────── 날짜·사람 표시 ───────────── */

export { whenLabel };

/** 커밋 메시지 → 사람이 읽을 한 줄 (편집 요약이 있으면 그것) */
function summary(e: HistoryEntry): string {
  // 위키가 만든 커밋("docs :: 「제목」 수정")이면 본문의 편집 요약이 더 알차다
  const body = (e.body ?? "").split("\n")[0].trim();
  if (body && /^docs :: 「/.test(e.message)) return body;
  return e.message.replace(/^\w+\s*::\s*/, "");
}

/* ───────────── 공급자 ───────────── */

export function HistoryProvider({ space, slug, children }: { space: SpaceKey; slug: string[]; children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpenState] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [compare, setCompare] = useState<Compare | null>(null);
  const [pending, startTransition] = useTransition();
  const slugKey = slug.join("/");

  const load = useCallback(async () => {
    try {
      const r = await api<{ entries: HistoryEntry[] }>(`/api/wiki/${space}/history/${apiSlug(slugKey.split("/"))}?limit=200`);
      setEntries(r.entries);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "기록을 불러오지 못했어요.");
    }
  }, [space, slugKey]);

  const setOpen = useCallback(
    (v: boolean) => {
      setOpenState(v);
      if (v) void load();
      // 데스크톱에서 패널을 닫으면 비교도 끝낸다 (모바일 시트는 닫아도 비교 화면을 남긴다)
      if (!v && !isMobileViewport()) setCompare(null);
    },
    [load]
  );

  // 문서가 바뀌면 처음부터 (렌더 중 상태 조정 패턴)
  const [lastSlug, setLastSlug] = useState(slugKey);
  if (lastSlug !== slugKey) {
    setLastSlug(slugKey);
    setEntries(null);
    setCompare(null);
  }

  // <html data-history> — CSS 가 패널·목차 카드 자리를 정한다
  useEffect(() => {
    const root = document.documentElement;
    if (open) root.setAttribute("data-history", "open");
    else root.removeAttribute("data-history");
    return () => root.removeAttribute("data-history");
  }, [open]);

  // 명령 팔레트 "이 문서 수정 기록"(H)
  useEffect(() => {
    const on = (e: Event) => {
      const want = (e as CustomEvent<{ open?: boolean }>).detail?.open;
      setOpen(want === undefined ? !document.documentElement.hasAttribute("data-history") : want);
    };
    window.addEventListener(HISTORY_EVENT, on);
    return () => window.removeEventListener(HISTORY_EVENT, on);
  }, [setOpen]);

  // Esc 로 비교·패널 닫기
  useEffect(() => {
    if (!open && !compare) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (compare) setCompare(null);
      else setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, compare, setOpen]);

  const select = useCallback(
    (entry: HistoryEntry, index: number) => {
      if (index === 0) {
        // 맨 위(지금) 버전 = 지금 문서
        setCompare(null);
        return;
      }
      if (isMobileViewport()) setOpenState(false);
      setCompare({ entry, node: null, error: null, same: false });
      startTransition(async () => {
        const r = await compareRevision(space, slugKey.split("/"), entry.rev);
        setCompare((c) =>
          c && c.entry.rev === entry.rev
            ? r.ok
              ? { entry, node: r.node, error: null, same: r.same }
              : { entry, node: null, error: r.message, same: false }
            : c
        );
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [space, slugKey]
  );

  const revert = useCallback(async () => {
    if (!compare) return;
    const { entry } = compare;
    try {
      await api(`/api/wiki/${space}/revert/${apiSlug(slugKey.split("/"))}`, {
        method: "POST",
        body: { rev: entry.rev, message: `${whenLabel(entry.date)} ${entry.author} 버전으로 되돌림` },
      });
      toast({ message: `${whenLabel(entry.date)} 버전으로 되돌렸어요` });
      setCompare(null);
      router.refresh();
      await load();
    } catch (e) {
      toast({ message: e instanceof ApiError ? e.message : "되돌리지 못했어요.", tone: "error" });
    }
  }, [compare, space, slugKey, router, load]);

  return (
    <HistoryCtx.Provider
      value={{ open, setOpen, entries, loadError, compare, pending, select, clear: () => setCompare(null), revert }}
    >
      {children}
    </HistoryCtx.Provider>
  );
}

/* ───────────── 위 막대 버튼 ───────────── */

export function HistoryButton() {
  const { open, setOpen } = useHistory();
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls="history-panel"
      title="수정 기록 (H)"
      className={`inline-flex h-8 flex-none items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors ${
        open ? "bg-sel text-accent" : "font-medium text-fg-2 hover:bg-hover"
      }`}
    >
      <HistoryIcon size={16} />
      기록
    </button>
  );
}

/* ───────────── 본문 칼럼: 원래 글 ↔ 비교 화면 ───────────── */

export function HistorySwap({ children }: { children: React.ReactNode }) {
  const { compare, pending, revert, clear } = useHistory();
  const me = useMe();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // 다른 버전을 고르면 확인 상태를 푼다
  const [lastRev, setLastRev] = useState<string | null>(null);
  const rev = compare?.entry.rev ?? null;
  if (rev !== lastRev) {
    setLastRev(rev);
    setConfirming(false);
  }

  const active = compare !== null;
  return (
    <>
      {compare && (
        <article className="pt-[18px] pb-20" aria-label="수정 기록 비교">
          <div className="history-banner mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-lg px-3.5 py-2.5 text-[13.5px] text-fg" role="status">
            <Avatar name={compare.entry.author} />
            {confirming ? (
              <span className="min-w-0 flex-1">
                <b>{whenLabel(compare.entry.date)}</b> 내용으로 되돌릴까요? 지금 내용도 기록에 남아요.
              </span>
            ) : (
              <span className="min-w-0 flex-1">
                <b>
                  {whenLabel(compare.entry.date)} {compare.entry.author}
                </b>
                {josa(compare.entry.author, "이", "가")} 고친 뒤와 지금을 비교하는 중
              </span>
            )}
            {canEditNow(me) &&
              (confirming ? (
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await revert();
                      setBusy(false);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13.5px] font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60"
                  >
                    <RestoreIcon size={15} />
                    {busy ? "되돌리는 중…" : "되돌리기"}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="h-8 rounded-md border border-line bg-bg px-3 text-[13.5px] font-medium text-fg hover:bg-hover">
                    취소
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!compare.node || compare.same}
                  onClick={() => setConfirming(true)}
                  className="h-8 rounded-md border border-line bg-bg px-3 text-[13.5px] font-medium text-fg hover:bg-hover disabled:opacity-50"
                >
                  이 때로 되돌리기
                </button>
              ))}
            <button type="button" onClick={clear} aria-label="비교 끝내기" title="비교 끝내기 (Esc)" className="grid size-8 place-items-center rounded-md text-fg-2 hover:bg-black/5 min-[769px]:hidden">
              <CloseIcon size={16} />
            </button>
          </div>
          {compare.error ? (
            <p className="py-10 text-center text-[15px] text-fg-3">{compare.error}</p>
          ) : compare.node ? (
            <>
              {compare.same && <p className="mb-4 text-[14px] text-fg-3">이 버전 뒤로 바뀐 내용이 없어요.</p>}
              <div className={pending ? "opacity-60 transition-opacity" : ""}>{compare.node}</div>
            </>
          ) : (
            <p className="py-10 text-center text-[15px] text-fg-3">비교하는 중…</p>
          )}
        </article>
      )}
      <div hidden={active}>{children}</div>
    </>
  );
}

/* ───────────── 오른쪽 패널 (모바일: 아래 시트) ───────────── */

export function HistoryPanel() {
  const { open, setOpen, entries, loadError, compare, select } = useHistory();
  const groups: { day: string; items: { e: HistoryEntry; i: number }[] }[] = [];
  (entries ?? []).forEach((e, i) => {
    const day = dayLabel(new Date(e.date));
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push({ e, i });
    else groups.push({ day, items: [{ e, i }] });
  });
  const selected = compare?.entry.rev ?? entries?.[0]?.rev;

  return (
    <>
      <div className="history-scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden />
      <aside id="history-panel" className="history-panel" data-open={open} aria-label="수정 기록">
        <div className="mx-1.5 mt-0.5 mb-2.5 flex items-center gap-2">
          <h2 className="text-[14px] font-bold text-fg">수정 기록</h2>
          <span className="ml-auto text-[12px] text-fg-3">{entries ? `${entries.length}개` : ""}</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="수정 기록 닫기" className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover">
            <CloseIcon size={15} />
          </button>
        </div>
        {loadError && <p className="px-2 py-6 text-[13px] text-fg-3">{loadError}</p>}
        {!entries && !loadError && <p className="px-2 py-6 text-[13px] text-fg-3">불러오는 중…</p>}
        {entries && entries.length === 0 && <p className="px-2 py-6 text-[13px] text-fg-3">아직 기록이 없어요.</p>}
        {groups.map((g) => (
          <section key={g.day}>
            <h3 className="mx-2 mt-3 mb-1 text-[11px] font-semibold tracking-[0.05em] text-fg-3">{g.day}</h3>
            <ul className="flex flex-col gap-px">
              {g.items.map(({ e, i }) => {
                const on = e.rev === selected;
                return (
                  <li key={e.rev}>
                    <button
                      type="button"
                      onClick={() => select(e, i)}
                      aria-current={on ? "true" : undefined}
                      className={`flex w-full gap-2.5 rounded-lg px-2.5 py-[9px] text-left text-[13px] transition-colors ${on ? "bg-sel" : "hover:bg-hover"}`}
                    >
                      <Avatar name={e.author} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1">
                          <b className="truncate text-[13.5px] font-semibold text-fg">{e.author}</b>
                          {i === 0 && <span className="flex-none rounded bg-ok-bg px-[5px] text-[11px] text-ok">지금</span>}
                        </span>
                        <small className="mt-0.5 block text-[12px] leading-[1.45] text-fg-3">
                          {hm.format(new Date(e.date))} · {summary(e)}
                        </small>
                      </span>
                      <span className="flex-none text-[11.5px] whitespace-nowrap">
                        {!!e.added && <span className="text-ok">+{e.added}</span>}
                        {!!e.added && !!e.removed && " "}
                        {!!e.removed && <span className="text-del">−{e.removed}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </aside>
    </>
  );
}
