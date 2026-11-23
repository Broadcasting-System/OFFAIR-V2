import { LoginWall } from "@/components/members/login-wall";
import { pageAccess } from "@/lib/wiki/server-viewer";

/**
 * 읽기 화면의 문지기. 두 공간(가이드북·개발 문서) 모두 부원(졸업생 포함)만 읽는다.
 * 읽을 수 없으면 로그인 벽을 돌려주고(문서가 있든 없든 같은 화면), 읽을 수 있으면 null.
 * headers() 를 읽으므로 이걸 부르는 화면은 요청마다 그려진다.
 */
export async function readGate(next: string): Promise<React.ReactElement | null> {
  const { viewer, canReadMembers } = await pageAccess();
  if (canReadMembers) return null;
  return <LoginWall next={next} mode={viewer.authenticated ? "forbidden" : "login"} />;
}

/** 읽을 수 없는 사람에게 줄 메타데이터 (문서 제목도 숨긴다) */
export async function canReadPages(): Promise<boolean> {
  return (await pageAccess()).canReadMembers;
}

/** catch-all 조각(인코딩됐을 수 있음)으로 로그인 뒤 돌아올 주소를 만든다 */
export function pathOf(prefix: string, slug: string[]): string {
  return (
    prefix +
    "/" +
    slug
      .map((s) => {
        let d = s;
        try {
          d = decodeURIComponent(s);
        } catch {
          /* 그대로 */
        }
        return encodeURIComponent(d);
      })
      .join("/")
  );
}
