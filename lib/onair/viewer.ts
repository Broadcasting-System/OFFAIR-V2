import { GUEST, resolveViewer, tokenOf, type Role, type Viewer } from "@/lib/wiki/auth";
import { fallbackViewer } from "./access";

/**
 * ONAIR 상태 화면·다시 켜기에서 "지금 누구인가".
 *
 * 평소에는 위키와 똑같이 ONAIR 가 정한다. ONAIR 가 답하지 않을 때만(서버가 꺼졌을 때 = 이 기능이 필요한 때)
 * Access 토큰을 직접 확인하고 최근 기록으로 역할을 정한다 (lib/onair/access.ts).
 */

const VIEW_ROLES: Role[] = ["member", "lead", "superadmin"];
const START_ROLES: Role[] = ["lead", "superadmin"];

/** 상태 보기 — 방송부 부원 이상 */
export function canViewOnair(v: Viewer): boolean {
  return v.authenticated && VIEW_ROLES.includes(v.role);
}
/** 다시 켜기 — 부장·최고 관리자 */
export function canStartOnair(v: Viewer): boolean {
  return v.authenticated && START_ROLES.includes(v.role);
}

export interface OnairWho {
  /** ONAIR 화면에서 쓸 사람 */
  viewer: Viewer;
  /** 위키 권한에 쓰는 사람 (ONAIR 가 정한 그대로) */
  base: Viewer;
  /** 최근 기록으로 정했나 (ONAIR 꺼짐) */
  fallback: boolean;
  /** ONAIR 신원 확인이 답하지 않았나 */
  onairDown: boolean;
  /** 요청에 Access 토큰이 있었나 */
  hasToken: boolean;
}

export async function onairViewer(req: Request): Promise<OnairWho> {
  const { viewer: base, onairDown } = await resolveViewer(req);
  const token = tokenOf(req);
  const hasToken = !!token;
  if (base.role !== "guest" || !onairDown || !token) return { viewer: base, base, fallback: false, onairDown, hasToken };
  const fb = await fallbackViewer(token);
  return fb ? { viewer: fb, base, fallback: true, onairDown, hasToken } : { viewer: GUEST, base, fallback: false, onairDown, hasToken };
}
