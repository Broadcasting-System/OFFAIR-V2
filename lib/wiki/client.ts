import { useEffect, useSyncExternalStore } from "react";

/**
 * 브라우저에서 위키 API 를 부르는 도우미와 "나"(GET /api/me) 상태.
 * 클라이언트 컴포넌트에서만 쓴다.
 */

export interface Me {
  role: string;
  name: string;
  memberId: string | null;
  authenticated: boolean;
  /** ONAIR 기수 ("4") · 역할 이름 ("부장") — 모르면 null */
  cohort?: string | null;
  roleLabel?: string | null;
  canEdit: boolean;
  canReadMembers: boolean;
  canComment: boolean;
  canModerate: boolean;
  readOnly: boolean;
  /** ONAIR 상태 화면(/onair) — 볼 수 있나·다시 켤 수 있나 */
  onair?: { canView: boolean; canStart: boolean };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** JSON API 호출. 실패하면 서버가 준 한국어 메시지로 ApiError */
export async function api<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
    cache: "no-store",
  });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* 본문 없음 */
  }
  if (!res.ok) {
    const { error, message, ...extra } = data;
    throw new ApiError(res.status, String(error ?? "error"), String(message ?? `요청이 실패했어요 (${res.status})`), extra);
  }
  return data as T;
}

/* ───────────── 나 ───────────── */

let me: Me | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(force = false) {
  if (loading && !force) return loading;
  loading = api<Me>("/api/me")
    .then((m) => {
      me = m;
    })
    .catch(() => {
      me = {
        role: "guest",
        name: "손님",
        memberId: null,
        authenticated: false,
        canEdit: false,
        canReadMembers: false,
        canComment: false,
        canModerate: false,
        readOnly: true,
      };
    })
    .finally(() => listeners.forEach((l) => l()));
  return loading;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** 지금 사람. 받아 오기 전에는 null */
export function useMe(): Me | null {
  const value = useSyncExternalStore(
    subscribe,
    () => me,
    () => null
  );
  useEffect(() => {
    if (!me) void load();
  }, []);
  return value;
}

/** 편집할 수 있는 사람인가 (읽기 전용 서버면 아니다) */
export function canEditNow(m: Me | null): boolean {
  return !!m && m.canEdit && !m.readOnly;
}

/* ───────────── 위키 화면끼리 주고받는 신호 ───────────── */

/** 트리가 바뀌었다 (만들기·옮기기 등). highlight 가 있으면 그 문서를 "새로 만듦" 으로 표시 */
export const TREE_CHANGED_EVENT = "offair:tree-changed";
/** 수정 기록 패널 열기/닫기 */
export const HISTORY_EVENT = "offair:history";

export function emitTreeChanged(detail: { space: string; highlight?: string } = { space: "guide" }) {
  window.dispatchEvent(new CustomEvent(TREE_CHANGED_EVENT, { detail }));
}

export function toggleHistory(open?: boolean) {
  window.dispatchEvent(new CustomEvent(HISTORY_EVENT, { detail: { open } }));
}

/** 입력 중인 곳(글 칸·편집기)인가 — 한 글자 단축키를 막을 때 */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}
