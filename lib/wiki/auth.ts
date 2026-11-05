import crypto from "node:crypto";
import type { SpaceId } from "@/lib/store/space";

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
  source: "onair" | "dev" | "none";
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
    source: "dev",
  };
}

/** 요청자. ONAIR 가 안 되면 손님으로 본다 (공개 문서는 계속 보이게) */
export async function getViewer(req: Request): Promise<Viewer> {
  const dev = devViewer();
  if (dev) return dev;

  const token = tokenOf(req);
  if (!token || token.length > 8192) return GUEST;

  const key = crypto.createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.exp > now) return hit.viewer;

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
      if (res.status < 500) cache.set(key, { viewer: GUEST, exp: now + Math.min(ttl(), 10_000) });
      return GUEST;
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
      source: "onair",
    };
  } catch (e) {
    // ONAIR 가 꺼졌거나 느림 — 캐시하지 않고 손님으로
    console.warn("[offair] ONAIR 신원 확인 실패:", (e as Error).message);
    return GUEST;
  }
  if (cache.size >= MAX_CACHE) {
    for (const [k, v] of cache) if (v.exp <= now) cache.delete(k);
    if (cache.size >= MAX_CACHE) cache.clear();
  }
  cache.set(key, { viewer, exp: now + (viewer.role === "guest" ? Math.min(ttl(), 10_000) : ttl()) });
  return viewer;
}
