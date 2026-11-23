import { revalidatePath } from "next/cache";
import type { SpaceId } from "@/lib/store/space";

/**
 * 가이드북이 바뀌면 사이트 전체를 다시 그리게 표시한다.
 * 화면은 모두 요청마다 그리므로(권한 확인) 서버 캐시는 없지만, 브라우저 라우터 캐시를 비우는 데 쓴다.
 * Route Handler 안에서는 "다음 방문 때 다시 그림" 으로 동작한다.
 * 요청 밖(테스트·타이머)에서 부르면 Next 가 오류를 내므로 조용히 넘긴다.
 */
export function revalidateSpace(space: SpaceId): void {
  if (space !== "guide") return;
  try {
    revalidatePath("/", "layout");
  } catch {
    /* 요청 컨텍스트 밖 */
  }
}
