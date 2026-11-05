import "server-only";
import { headers } from "next/headers";
import { GUEST, canEdit, canReadMembers, getViewer, type Viewer } from "./auth";
import { getStore } from "@/lib/store";

/**
 * 서버 컴포넌트(페이지)에서 "지금 보는 사람". API 와 같은 규칙(lib/wiki/auth.ts)으로 정한다.
 * headers() 를 읽으므로 이걸 부르는 페이지는 언제나 요청마다 새로 그려진다(정적 생성·캐시 없음).
 */
export async function getPageViewer(): Promise<Viewer> {
  const h = await headers();
  // getViewer 는 Request 를 받는다 — 머리글만 옮겨 담는다 (주소는 쓰지 않는다)
  const req = new Request("http://offair.local/", { headers: new Headers(h) });
  try {
    return await getViewer(req);
  } catch {
    return GUEST;
  }
}

export async function pageAccess() {
  const viewer = await getPageViewer();
  const readOnly = getStore().config.readOnly;
  return {
    viewer,
    canReadMembers: canReadMembers(viewer),
    canEdit: canEdit(viewer) && !readOnly,
    readOnly,
  };
}
