import crypto from "node:crypto";
import type { SpaceId } from "@/lib/store/space";
import { HttpError } from "./http";
import { isLoopback, peerOf } from "./peer";
import { rememberAccess } from "@/lib/onair/access";

/**
 * 누가 요청했는지 — ONAIR 서버에 물어본다.
 *
 * Cloudflare Access 가 편집·부원 경로 앞에서 로그인시키고 `Cf-Access-Jwt-Assertion` 머리글을 붙인다.
 * (머리글이 없으면 Access 쿠키 `CF_Authorization` 을 쓴다 — 공개 경로에서도 로그인한 사람을 알아보려고)
 * 그 토큰을 같은 PC 의 ONAIR `GET /api/members/me` 로 그대로 넘기면 ONAIR 가 서명·AUD 를 확인하고
 * 역할을 돌려준다. 토큰이 없으면 ONAIR 를 부르지 않는다 — 토큰 없이 127.0.0.1 에서 부르면
 * ONAIR 가 "서버 자신"으로 볼 수 있기 때문이다.
 *
 * 규칙
 * - guide 읽기: 누구나
 * - members 읽기: member·lead·superadmin, 그리고 alumni(읽기만)
 * - 모든 쓰기(저장·만들기·삭제·이동·업로드·댓글·되돌리기): member 이상
 * - 댓글 보기: 부원 공간을 읽을 수 있는 사람 / 남의 댓글 지우기: lead 이상
 */

export const ROLES = ["superadmin", "lead", "member", "alumni", "teacher", "guest"] as const;
export type Role = (typeof ROLES)[number];

export interface Viewer {
  role: Role;
  name: string;
  memberId: string | null;
  /** 로그인 토큰이 있었고 ONAIR 가 답했다 (역할이 guest 여도) */
  authenticated: boolean;
  /** ONAIR 부원 정보 — 기수(예: "4"), 역할 이름(예: "부장"). 모르면 null */
  cohort?: string | null;
  roleLabel?: string | null;
  /** roster = ONAIR 가 꺼져 있을 때 Access 토큰을 직접 확인하고 최근 기록으로 정한 사람 (ONAIR 화면에서만, lib/onair/viewer.ts) */
  source: "onair" | "dev" | "service" | "none" | "roster";
}

export const GUEST: Viewer = {
  role: "guest",
  name: "손님",
  memberId: null,
  authenticated: false,
  source: "none",
};

const EDIT_ROLES: Role[] = ["member", "lead", "superadmin"];
const MEMBER_READ_ROLES: Role[] = ["member", "lead", "superadmin", "alumni"];
const MODERATOR_ROLES: Role[] = ["lead", "superadmin"];

export function canEdit(v: Viewer): boolean {
  return EDIT_ROLES.includes(v.role);
}
export function canReadMembers(v: Viewer): boolean {
  return MEMBER_READ_ROLES.includes(v.role);
}
export function canReadSpace(v: Viewer, space: SpaceId): boolean {
  return space === "guide" ? true : canReadMembers(v);
}
export function canReadComments(v: Viewer): boolean {
  return canReadMembers(v);
}
export function canModerate(v: Viewer): boolean {
  return MODERATOR_ROLES.includes(v.role);
}

export function permissions(v: Viewer) {
  return {
    canEdit: canEdit(v),
    canReadMembers: canReadMembers(v),
    canComment: canEdit(v),
    canModerate: canModerate(v),
  };
}

export const JWT_HEADER = "cf-access-jwt-assertion";
export const ACCESS_COOKIE = "CF_Authorization";

function normalizeRole(r: unknown): Role {
  const s = String(r ?? "").toLowerCase();
  const legacy: Record<string, Role> = { admin: "lead", operator: "member", viewer: "alumni" };
  if ((ROLES as readonly string[]).includes(s)) return s as Role;
  return legacy[s] ?? "guest";
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      const v = part.slice(i + 1).trim();
      return v || null;
    }
  }
  return null;
}

export function tokenOf(req: Request): string | null {
  const h = req.headers.get(JWT_HEADER);
  if (h && h.trim()) return h.trim();
  return readCookie(req.headers.get("cookie"), ACCESS_COOKIE);
}

/* ───────────── 캐시 (토큰 해시 → 결과, 짧게) ───────────── */

interface Cached {
  viewer: Viewer;
  exp: number;
}
const g = globalThis as unknown as { __offairAuthCache?: Map<string, Cached> };
const cache: Map<string, Cached> = (g.__offairAuthCache ??= new Map());
const MAX_CACHE = 500;

export function clearAuthCache(): void {
  cache.clear();
}

function ttl(): number {
  const n = Number(process.env.OFFAIR_AUTH_CACHE_MS);
  return Number.isFinite(n) && n >= 0 ? n : 60_000;
}

function devViewer(): Viewer | null {
  if (process.env.NODE_ENV === "production") return null;
  const r = process.env.OFFAIR_DEV_ROLE;
  if (!r) return null;
  const role = normalizeRole(r);
  return {
    role,
    name: process.env.OFFAIR_DEV_NAME || "개발자",
    memberId: process.env.OFFAIR_DEV_MEMBER_ID || "dev",
    authenticated: role !== "guest",
    cohort: process.env.OFFAIR_DEV_COHORT || null,
    roleLabel: null,
    source: "dev",
  };
}

/* ───────────── 같은 PC 서비스(CUE)의 읽기 전용 대리 접근 ───────────── */

export const SERVICE_HEADER = "x-offair-service";
export const SERVICE_ROLE_HEADER = "x-offair-as-role";
export const SERVICE_NAME_HEADER = "x-offair-as-name";

/** Cloudflare(터널 포함)를 거쳐 온 요청의 흔적 — 터널은 같은 PC 에서 붙으므로 소켓 주소만으로는 모른다 */
function viaCloudflare(req: Request): boolean {
  const h = req.headers;
  if (h.get("cf-connecting-ip") || h.get("cf-ray") || h.get("cf-visitor") || h.get("cf-ipcountry")) return true;
  return /cloudflare/i.test(h.get("cdn-loop") ?? "");
}

function sameSecret(a: string, b: string): boolean {
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

/**
 * `X-Offair-Service: <OFFAIR_SERVICE_TOKEN>` 머리글이 있는 요청.
 *  - 토큰 env 가 없으면 이 기능은 꺼져 있다 → undefined (보통 요청으로 처리, 머리글은 무시)
 *  - 토큰이 틀림·소켓이 127.0.0.1/::1 이 아님·Cloudflare 를 거쳐 옴 → 403
 *  - GET/HEAD 가 아니면 403 (읽기 전용)
 *  - 통과하면 `X-Offair-As-Role`(모르는 값은 guest)·`X-Offair-As-Name`(URL 인코딩) 사람으로 본다.
 *    그 뒤 권한은 보통 규칙 그대로 (부원 공간은 그 역할이 읽을 수 있을 때만).
 */
export function serviceViewer(req: Request): Viewer | undefined {
  const sent = req.headers.get(SERVICE_HEADER);
  if (sent === null) return undefined;
  const token = process.env.OFFAIR_SERVICE_TOKEN || "";
  if (!token) return undefined;
  if (!sameSecret(sent.trim(), token)) throw new HttpError(403, "forbidden", "서비스 토큰이 맞지 않습니다.");
  if (viaCloudflare(req) || !isLoopback(peerOf(req))) {
    throw new HttpError(403, "forbidden", "서비스 접근은 같은 PC(127.0.0.1)에서만 됩니다.");
  }
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") throw new HttpError(403, "forbidden", "서비스 접근은 읽기만 됩니다.");
  const r = String(req.headers.get(SERVICE_ROLE_HEADER) ?? "").trim().toLowerCase();
  const role: Role = (ROLES as readonly string[]).includes(r) ? (r as Role) : "guest";
  let name = "";
  try {
    name = decodeURIComponent(req.headers.get(SERVICE_NAME_HEADER) ?? "");
  } catch {
    name = "";
  }
  name = name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80);
  return {
    role,
    name: name || (role === "guest" ? "손님" : "CUE"),
    memberId: null,
    authenticated: role !== "guest",
    source: "service",
    cohort: null,
    roleLabel: null,
  };
}

/** 요청자. ONAIR 가 안 되면 손님으로 본다 (공개 문서는 계속 보이게) */
export async function getViewer(req: Request): Promise<Viewer> {
  return (await resolveViewer(req)).viewer;
}

/**
 * getViewer 와 같지만, 손님이 된 까닭이 "ONAIR 가 답하지 않음(꺼짐·느림·5xx)" 인지도 알려 준다.
 * ONAIR 다시 켜기 화면(lib/onair/viewer.ts)이 그때만 Access 토큰을 직접 확인하는 데 쓴다.
 */
export async function resolveViewer(req: Request): Promise<{ viewer: Viewer; onairDown: boolean }> {
  const service = serviceViewer(req);
  if (service) return { viewer: service, onairDown: false };
  const dev = devViewer();
  if (dev) return { viewer: dev, onairDown: false };

  const token = tokenOf(req);
  if (!token || token.length > 8192) return { viewer: GUEST, onairDown: false };

  const key = crypto.createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.exp > now) return { viewer: hit.viewer, onairDown: false };

  const base = (process.env.ONAIR_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const timeout = Number(process.env.OFFAIR_ONAIR_TIMEOUT_MS) || 3000;
  let viewer: Viewer;
  try {
    const res = await fetch(`${base}/api/members/me`, {
      headers: { [JWT_HEADER]: token, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      // 4xx 는 짧게 캐시, 5xx 는 캐시하지 않는다
      if (res.status < 500) {
        cache.set(key, { viewer: GUEST, exp: now + Math.min(ttl(), 10_000) });
        return { viewer: GUEST, onairDown: false };
      }
      return { viewer: GUEST, onairDown: true };
    }
    const j = (await res.json()) as Record<string, unknown>;
    let role = normalizeRole(j.role);
    // 승인 대기·해제된 부원은 손님
    if (j.status !== undefined && j.status !== null && j.status !== "approved") role = "guest";
    viewer = {
      role,
      name: String(j.name ?? "").trim().slice(0, 80) || (role === "guest" ? "손님" : "부원"),
      memberId: j.memberId === undefined || j.memberId === null ? null : String(j.memberId),
      authenticated: true,
      cohort: j.cohort === undefined || j.cohort === null || j.cohort === "" ? null : String(j.cohort).slice(0, 10),
      roleLabel: typeof j.roleLabel === "string" && j.roleLabel.trim() ? j.roleLabel.trim().slice(0, 20) : null,
      source: "onair",
    };
  } catch (e) {
    // ONAIR 가 꺼졌거나 느림 — 캐시하지 않고 손님으로
    console.warn("[offair] ONAIR 신원 확인 실패:", (e as Error).message);
    return { viewer: GUEST, onairDown: true };
  }
  // ONAIR 가 확인해 준 부원은 기억해 둔다 — ONAIR 가 꺼졌을 때 'ONAIR 다시 켜기' 화면에서 쓴다
  rememberAccess(token, viewer);
  if (cache.size >= MAX_CACHE) {
    for (const [k, v] of cache) if (v.exp <= now) cache.delete(k);
    if (cache.size >= MAX_CACHE) cache.clear();
  }
  cache.set(key, { viewer, exp: now + (viewer.role === "guest" ? Math.min(ttl(), 10_000) : ttl()) });
  return { viewer, onairDown: false };
}
