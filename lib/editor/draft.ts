/**
 * 문서별 초안 — 브라우저 localStorage 에 몇 초마다·포커스를 잃을 때 저장한다.
 * 게시하면 지운다. 저장소가 막힌 브라우저(사생활 보호 창 등)에서도 편집기는 그대로 돈다.
 */
export interface Draft {
  mdx: string;
  /** 초안을 쓰기 시작한 게시본 판 번호 — 그 사이 게시본이 바뀌었는지 알려 줄 때 쓴다 */
  baseRev: string | null;
  savedAt: number;
}

const key = (space: string, path: string) => `offair:draft:${space}:${path}`;

export function loadDraft(space: string, path: string): Draft | null {
  try {
    const raw = localStorage.getItem(key(space, path));
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return typeof d?.mdx === "string" ? d : null;
  } catch {
    return null;
  }
}

export function saveDraft(space: string, path: string, draft: Draft): boolean {
  try {
    localStorage.setItem(key(space, path), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(space: string, path: string): void {
  try {
    localStorage.removeItem(key(space, path));
  } catch {
    /* 무시 */
  }
}

export function hhmm(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
