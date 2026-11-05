import remarkGfm, { type Options } from "remark-gfm";

/**
 * GFM 설정 — 사이트 렌더러·편집기 읽기/쓰기·수정 기록 비교가 모두 이 값을 쓴다.
 * 취소선은 `~~글~~` 만. 가이드에 흔한 "1~4번", "3~5초" 의 물결 하나는 그냥 글자다.
 */
export const GFM_OPTIONS: Options = { singleTilde: false };

/** remark/mdx 플러그인 목록에 그대로 넣는 꼴 */
export const remarkGfmPlugin: [typeof remarkGfm, Options] = [remarkGfm, GFM_OPTIONS];

export { remarkGfm };
