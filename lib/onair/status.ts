import net from "node:net";

/**
 * ONAIR 세 부분이 켜져 있는지 — 같은 PC 의 127.0.0.1 포트에 TCP 로 붙어 본다.
 * 서버(8000)는 `GET /health` 도 불러 `{"status":"healthy"}` 인지 본다.
 * 포트는 'ONAIR 시작.cmd' 와 같다.
 */

export const ONAIR_APPS = [
  { id: "server", name: "서버", port: 8000 },
  { id: "display", name: "송출 화면", port: 3000 },
  { id: "control", name: "컨트롤", port: 3001 },
] as const;

export type OnairAppId = (typeof ONAIR_APPS)[number]["id"];
/** healthy = 정상 응답 · unhealthy = 답은 했지만 정상이 아님 · no_answer = 답 없음 */
export type Health = "healthy" | "unhealthy" | "no_answer";

export interface AppStatus {
  id: OnairAppId;
  name: string;
  port: number;
  up: boolean;
  /** 서버만 */
  health?: Health;
}

export interface OnairStatus {
  checkedAt: string;
  apps: AppStatus[];
  allUp: boolean;
  allDown: boolean;
}

export interface StatusDeps {
  probePort?: (port: number) => Promise<boolean>;
  fetchHealth?: () => Promise<unknown>;
  now?: () => number;
}

const PROBE_HOST = "127.0.0.1";
const PORT_TIMEOUT_MS = 800;
const HEALTH_TIMEOUT_MS = 2000;

/** 포트에 붙으면 true. 거절·시간 초과면 false */
export function probePort(port: number, host = PROBE_HOST, timeoutMs = PORT_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs, () => finish(false));
    sock.once("connect", () => finish(true));
    sock.once("error", () => finish(false));
  });
}

function healthUrl(): string {
  const base = (process.env.ONAIR_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");
  return `${base}/health`;
}

/** GET /health 의 본문(JSON). 답이 없으면 null, 2xx 가 아니면 { status: <코드> } */
export async function fetchHealth(url = healthUrl(), timeoutMs = HEALTH_TIMEOUT_MS): Promise<unknown> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    if (!res.ok) return { status: res.status };
    return await res.json().catch(() => ({ status: "not_json" }));
  } catch {
    return null;
  }
}

export function parseHealth(body: unknown): Health {
  if (body === null || body === undefined) return "no_answer";
  if (typeof body === "object" && (body as { status?: unknown }).status === "healthy") return "healthy";
  return "unhealthy";
}

export async function readOnairStatus(deps: StatusDeps = {}): Promise<OnairStatus> {
  const probe = deps.probePort ?? ((p: number) => probePort(p));
  const health = deps.fetchHealth ?? (() => fetchHealth());
  const now = deps.now ?? Date.now;
  const [ups, h] = await Promise.all([Promise.all(ONAIR_APPS.map((a) => probe(a.port).catch(() => false))), health().catch(() => null)]);
  const apps: AppStatus[] = ONAIR_APPS.map((a, i) => ({
    id: a.id,
    name: a.name,
    port: a.port,
    up: ups[i],
    ...(a.id === "server" ? { health: ups[i] ? parseHealth(h) : "no_answer" } : {}),
  }));
  return {
    checkedAt: new Date(now()).toISOString(),
    apps,
    allUp: apps.every((a) => a.up),
    allDown: apps.every((a) => !a.up),
  };
}
