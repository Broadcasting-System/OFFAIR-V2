/**
 * 되돌리기/다시 하기 — 순수 리듀서.
 *
 * - commit: 지금 상태를 과거로 밀고 새 상태로
 * - begin:  끌기 시작. 지금 상태를 과거로 밀어 두기만 (이후 live 로 덮어씀)
 * - live:   과거에 쌓지 않고 지금 상태만 바꿈 (끄는 중)
 */

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export type HistoryAction<T> =
  | { type: "commit"; next: T }
  | { type: "begin" }
  | { type: "live"; next: T }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; present: T };

const LIMIT = 100;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function historyReducer<T>(h: History<T>, a: HistoryAction<T>): History<T> {
  switch (a.type) {
    case "commit":
      if (a.next === h.present) return h;
      return { past: [...h.past, h.present].slice(-LIMIT), present: a.next, future: [] };
    case "begin":
      return { past: [...h.past, h.present].slice(-LIMIT), present: h.present, future: [] };
    case "live":
      return { ...h, present: a.next };
    case "undo": {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1];
      return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
    }
    case "redo": {
      if (!h.future.length) return h;
      const [next, ...rest] = h.future;
      return { past: [...h.past, h.present], present: next, future: rest };
    }
    case "reset":
      return initHistory(a.present);
  }
}
