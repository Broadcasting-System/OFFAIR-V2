import { isStoreError } from "@/lib/store/errors";

/**
 * API 응답 도우미. 모든 JSON 응답은 `Cache-Control: no-store` —
 * 부원 전용 내용이 Cloudflare·브라우저 공유 캐시에 남지 않게.
 * 오류는 언제나 `{ error: <코드>, message: <한국어 설명>, ...extra }`.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ error: code, message, ...extra }, { status });
}

export const unauthorized = () => new HttpError(401, "unauthorized", "로그인이 필요합니다.");
export const forbidden = (msg = "권한이 없습니다.") => new HttpError(403, "forbidden", msg);
export const notFound = (msg = "찾을 수 없습니다.") => new HttpError(404, "not_found", msg);
export const badRequest = (msg: string) => new HttpError(400, "bad_request", msg);

const MAX_JSON = 3 * 1024 * 1024;

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_JSON) throw new HttpError(413, "too_large", "요청이 너무 큽니다.");
  const text = await req.text();
  if (text.length > MAX_JSON) throw new HttpError(413, "too_large", "요청이 너무 큽니다.");
  if (!text.trim()) return {} as T;
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not object");
    return v as T;
  } catch {
    throw badRequest("JSON 본문을 읽을 수 없습니다.");
  }
}

/**
 * 쓰기 요청은 같은 사이트에서 온 것만 받는다 (Access 쿠키를 타고 다른 사이트가 폼을 보내는 것 방지).
 * 브라우저는 교차 출처 POST/PUT/DELETE 에 언제나 Origin 을 붙인다. Origin 이 없으면(서버·테스트) 통과.
 */
export function checkOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") {
    if (origin === "null") throw forbidden("다른 사이트에서 온 요청은 받지 않습니다.");
    return;
  }
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim();
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    /* 잘못된 Origin */
  }
  // 터널이 Host 를 바꿔 넘기는 경우를 위해 허용 목록 (예: OFFAIR_ALLOWED_ORIGINS=wiki.bssmcast.com)
  const allowed = (process.env.OFFAIR_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/^https?:\/\//, "").replace(/\/+$/, ""))
    .filter(Boolean);
  if (originHost && allowed.includes(originHost)) return;
  if (!host || originHost !== host) {
    throw forbidden("다른 사이트에서 온 요청은 받지 않습니다.");
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** 핸들러 감싸기 — 오류를 JSON 으로, 쓰기 요청은 Origin 확인 */
export async function handle(req: Request, fn: () => Promise<Response>): Promise<Response> {
  try {
    if (MUTATING.has(req.method.toUpperCase())) checkOrigin(req);
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message, e.extra);
    if (isStoreError(e)) return fail(e.status, e.code, e.message, e.extra);
    console.error("[offair] API 오류:", e);
    return fail(500, "internal", "서버 오류가 났습니다.");
  }
}
