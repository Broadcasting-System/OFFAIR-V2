"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PowerIcon, RefreshIcon } from "@/components/shell/icons";
import { ApiError, api } from "@/lib/wiki/client";

/**
 * ONAIR 상태 표 + 다시 켜기 (app/onair/page.tsx).
 * 세 줄(서버·송출 화면·컨트롤)에 켜짐/꺼짐 점, [새로 고침], 부장 이상에게만 [ONAIR 다시 켜기].
 * 켜기를 누르면 화면 안에서 한 번 더 확인받고, 켠 뒤에는 다 켜지거나 150초가 지날 때까지 3초마다 다시 본다.
 */

interface AppRow {
  id: string;
  name: string;
  port: number;
  up: boolean;
  health?: "healthy" | "unhealthy" | "no_answer";
}
interface Status {
  checkedAt: string;
  apps: AppRow[];
  allUp: boolean;
  allDown: boolean;
  canStart: boolean;
  startSupported: boolean;
}

type Phase = "idle" | "confirm" | "sending" | "starting" | "done" | "timeout";

const POLL_MS = 3000;
const LIMIT_MS = 150_000;

const HEALTH_TEXT: Record<NonNullable<AppRow["health"]>, string> = {
  healthy: "응답 정상",
  unhealthy: "켜졌지만 응답이 정상이 아니에요",
  no_answer: "응답 없음",
};

function hms(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function OnairPanel({ canStart, recent }: { canStart: boolean; recent: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(true);

  // 상태 받기 — setState 는 모두 응답 콜백 안에서만 (효과 안에서 바로 부르지 않게)
  const load = useCallback(
    (): Promise<Status | null> =>
      api<Status>("/api/onair/status").then(
        (s) => {
          if (!alive.current) return null;
          setStatus(s);
          setError(null);
          setLoading(false);
          return s;
        },
        (e: Error) => {
          if (alive.current) {
            setError(e.message);
            setLoading(false);
          }
          return null;
        }
      ),
    []
  );

  /** [새로 고침] — 도는 아이콘을 보여 주고 다시 본다 */
  const refresh = useCallback(() => {
    setLoading(true);
    return load();
  }, [load]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  // 켜는 동안 3초마다 다시 본다 — 다 켜지거나 150초가 지나면 멈춘다
  useEffect(() => {
    if (phase !== "starting") return;
    const tick = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    const poll = setInterval(async () => {
      const s = await load();
      if (s?.allUp) setPhase("done");
      else if (Date.now() - startedAt >= LIMIT_MS) setPhase("timeout");
    }, POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [phase, startedAt, load]);

  async function start() {
    setPhase("sending");
    setNotice(null);
    try {
      await api("/api/onair/start", { method: "POST" });
      setStartedAt(Date.now());
      setElapsed(0);
      setPhase("starting");
    } catch (e) {
      const err = e as ApiError;
      setNotice(err.message);
      setPhase("idle");
      if (err.code === "already_up") void refresh();
    }
  }

  const off = status?.apps.filter((a) => !a.up).map((a) => a.name) ?? [];
  const starting = phase === "starting";

  return (
    <>
      <section aria-labelledby="onair-parts" className="mt-8">
        <div className="flex items-center gap-2">
          <h2 id="onair-parts" className="text-[13px] font-semibold tracking-[0.04em] text-fg-3">
            세 부분
          </h2>
          <span className="flex-1" />
          {status && <span className="text-[12.5px] text-fg-3">{hms(status.checkedAt)} 확인</span>}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-[13px] text-fg-2 transition-colors hover:bg-hover disabled:opacity-60"
          >
            <RefreshIcon size={15} className={loading ? "animate-spin" : ""} />
            새로 고침
          </button>
        </div>

        <ul className="mt-3 divide-y divide-line-2 rounded-xl border border-line" aria-busy={!status}>
          {(status?.apps ?? PLACEHOLDER).map((a) => {
            const known = !!status;
            const pending = starting && known && !a.up;
            const dot = !known ? "bg-line" : a.up ? "bg-ok" : pending ? "bg-warn" : "bg-del";
            const word = !known ? "확인 중" : a.up ? "켜짐" : pending ? "켜는 중" : "꺼짐";
            return (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3.5">
                <span aria-hidden className={`size-2.5 flex-none rounded-full ${dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-fg">
                    {a.name}
                    <span className="ml-2 text-[12.5px] font-normal text-fg-3">{a.port}</span>
                  </span>
                  {known && a.health && a.up && <span className="block text-[13px] text-fg-3">{HEALTH_TEXT[a.health]}</span>}
                </span>
                <span className={`flex-none text-[14px] font-medium ${!known ? "text-fg-3" : a.up ? "text-ok" : pending ? "text-warn" : "text-del"}`}>
                  {word}
                </span>
              </li>
            );
          })}
        </ul>
        {error && (
          <p role="alert" className="mt-3 text-[13.5px] text-del">
            상태를 불러오지 못했어요. {error}
          </p>
        )}
        {recent && (
          <p className="mt-3 text-[13px] text-fg-3">ONAIR 서버가 답하지 않아, 최근 로그인 기록으로 누구인지 확인했어요.</p>
        )}
      </section>

      {canStart && (
        <section aria-labelledby="onair-start" className="mt-10">
          <h2 id="onair-start" className="text-[13px] font-semibold tracking-[0.04em] text-fg-3">
            다시 켜기
          </h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-fg-2">
            서버 PC 바탕화면의 &apos;ONAIR 시작&apos; 을 대신 실행해요. 꺼진 부분만 켜고, 켜져 있는 부분은 건드리지 않아요.
          </p>

          {status && !status.startSupported ? (
            <p className="mt-4 rounded-lg border border-line bg-bg-soft px-4 py-3 text-[13.5px] text-fg-2">
              이 OFFAIR 는 방송실 서버 PC 에서 돌고 있지 않아서 ONAIR 를 켤 수 없어요.
            </p>
          ) : phase === "confirm" || phase === "sending" ? (
            <div className="mt-4 rounded-lg border border-line bg-bg-soft px-4 py-4">
              <p className="text-[14.5px] font-semibold text-fg">꺼진 부분을 켤까요?</p>
              {off.length > 0 && <p className="mt-1 text-[13.5px] text-fg">켤 것: {off.join(" · ")}</p>}
              <p className="mt-1 text-[13.5px] leading-relaxed text-fg-2">
                켜져 있는 부분은 그대로 둬요. 다 켜지기까지 최대 2분쯤 걸리고, 그동안 이 화면이 알아서 다시 확인해요.
              </p>
              <div className="mt-3.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={phase === "sending"}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[14px] font-semibold text-accent-fg transition-[filter] hover:brightness-110 disabled:opacity-60"
                >
                  <PowerIcon size={16} />
                  {phase === "sending" ? "보내는 중" : "켜기"}
                </button>
                <button
                  type="button"
                  onClick={() => setPhase("idle")}
                  disabled={phase === "sending"}
                  className="h-9 rounded-lg border border-line px-3.5 text-[14px] text-fg-2 transition-colors hover:bg-hover disabled:opacity-60"
                >
                  취소
                </button>
              </div>
            </div>
          ) : starting ? (
            <p role="status" className="mt-4 text-[14px] text-fg-2">
              켜는 중이에요 · {Math.floor(elapsed / 1000)}초 지남 (최대 150초까지 확인해요)
            </p>
          ) : (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  setNotice(null);
                  setPhase("confirm");
                }}
                disabled={!status || status.allUp}
                className="flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-[14.5px] font-semibold text-accent-fg transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PowerIcon size={17} />
                ONAIR 다시 켜기
              </button>
              {status?.allUp && phase !== "done" && <p className="mt-2 text-[13px] text-fg-3">모두 켜져 있어요.</p>}
              {phase === "done" && (
                <p role="status" className="mt-2 text-[13.5px] text-ok">
                  모두 켜졌어요.
                </p>
              )}
              {phase === "timeout" && (
                <p role="alert" className="mt-2 text-[13.5px] leading-relaxed text-warn">
                  150초가 지나도 다 켜지지 않았어요. 조금 뒤 새로 고침해 보고, 그래도 꺼져 있으면 서버 PC 작업 표시줄의 &apos;ONAIR …&apos; 창을 확인해 주세요.
                </p>
              )}
            </div>
          )}
          {notice && (
            <p role="alert" className="mt-3 text-[13.5px] text-del">
              {notice}
            </p>
          )}
        </section>
      )}
    </>
  );
}

const PLACEHOLDER: AppRow[] = [
  { id: "server", name: "서버", port: 8000, up: false },
  { id: "display", name: "송출 화면", port: 3000, up: false },
  { id: "control", name: "컨트롤", port: 3001, up: false },
];
