/**
 * GET /login?next=/members/abc — 로그인 벽의 [로그인] 이 부르는 곳.
 *
 * 배포에서는 이 경로(`/login`)를 Cloudflare Access 앱이 지킨다. 로그인하지 않은 사람은 Access 가
 * 먼저 로그인 화면(메일 코드)을 띄우고, 통과하면 `CF_Authorization` 쿠키를 심은 채 이 주소로 돌려보낸다.
 * 여기서는 next 로 다시 보내기만 한다 → 사용자는 원래 보던 문서로 돌아오고, 그 뒤 요청은 쿠키로
 * 신원이 확인된다 (lib/wiki/auth.ts). Access 가 없는 개발 환경에서는 그냥 next 로 돌아간다.
 * next 는 사이트 안 경로만 받는다(열린 리다이렉트 방지).
 */
import { safeNext } from "@/lib/wiki/links";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  return new Response(null, {
    status: 303,
    headers: { location: next, "cache-control": "no-store" },
  });
}
