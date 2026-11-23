/**
 * 위키 화면 주소 모음 — 주소 규칙이 바뀌면 여기만 고친다.
 * (서버·클라이언트 어디서든 쓸 수 있게 순수 함수만 둔다)
 */

export type SpaceKey = "guide" | "members";

/**
 * 화면에 보이는 공간 이름. 내부 id(guide·members)와 주소(/docs·/members)는 그대로 두고 이름만 바꾼다
 * (링크·git 이력·CUE/MCP 의 space 값이 그대로 돌게).
 */
export const SPACE_LABEL: Record<SpaceKey, string> = {
  guide: "가이드북",
  members: "개발 문서",
};

/** 공간 첫 화면 주소 */
export function spaceHome(space: SpaceKey): string {
  return space === "guide" ? "/" : "/members";
}

/** 슬러그 조각을 URL 경로로 (한글은 인코딩) */
export function slugPath(slug: string[]): string {
  return slug.map(encodeURIComponent).join("/");
}

/** 문서를 읽는 화면 */
export function docHref(space: SpaceKey, slug: string[]): string {
  return `${space === "guide" ? "/docs" : "/members"}/${slugPath(slug)}`;
}

/**
 * 문서 편집 화면. 새 편집기(app/write)가 `/write/<space>/<slug…>` 로 생긴다.
 * 아직 그 화면이 없더라도 링크는 언제나 이 함수로 만든다.
 */
export function editHref(space: SpaceKey, slug: string[]): string {
  return `/write/${space}/${slugPath(slug)}`;
}

/** API 경로의 슬러그 부분 */
export function apiSlug(slug: string[]): string {
  return slugPath(slug);
}

/** 지금 보는 주소가 문서 화면이면 { space, slug } */
export function docFromPath(pathname: string): { space: SpaceKey; slug: string[] } | null {
  const m = /^\/(docs|members)\/(.+)$/.exec(pathname);
  if (!m) return null;
  const slug = m[2]
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  if (slug.length === 0) return null;
  return { space: m[1] === "docs" ? "guide" : "members", slug };
}

/** 받침 있는 말 뒤에는 a, 없으면 b (을/를, 이/가, 으로/로) */
export function josa(word: string, withBatchim: string, without: string): string {
  // 끝의 괄호·문장부호는 건너뛰고 마지막 글자를 본다 ("메인 세팅 (TTS · 스피커)" → 커)
  const ch = word.replace(/[^\p{L}\p{N}]+$/u, "").slice(-1);
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    if (withBatchim === "으로" && jong === 8) return without; // ㄹ 받침 + 로
    return jong ? withBatchim : without;
  }
  // 한글이 아니면 숫자·영문 끝소리를 대충 받침 없음으로
  return /[136780lmnLMN]$/.test(ch) ? withBatchim : without;
}

/** 로그인 뒤 돌아갈 주소 — 사이트 안 경로만 (열린 리다이렉트 방지) */
export function safeNext(raw: string | null | undefined): string {
  const v = String(raw ?? "");
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || /[\u0000-\u001f]/.test(v)) return "/";
  return v;
}

/** 로그인 벽의 [로그인] 주소 (/login 은 Cloudflare Access 가 지킨다) */
export function loginHref(next: string): string {
  return `/login?next=${encodeURIComponent(safeNext(next))}`;
}

/** Cloudflare Access 로그아웃 (쿠키를 지우고 Access 로그아웃 화면) */
export const LOGOUT_HREF = "/cdn-cgi/access/logout";
