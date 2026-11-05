import { revalidatePath } from "next/cache";
import type { SpaceId } from "@/lib/store/space";

/**
 * 공개 공간이 바뀌면 사이트 전체(루트 레이아웃의 사이드바·검색 포함)를 다시 그리게 표시한다.
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
