/**
 * 문서 경로 ↔ 주소.
 *   문서 경로(path) = content/ 기준, 확장자 없이: "docs/onair-time", "contribution"
 *   읽기 주소       = /docs/onair-time, /contribution
 *   편집 주소       = /write/docs/onair-time, /write/contribution
 */
export function docUrlOf(path: string): string {
  if (path.startsWith("docs/")) return "/" + path;
  if (path === "contribution") return "/contribution";
  return "/docs";
}

export function writeUrlOf(path: string): string {
  return "/write/" + path.split("/").map(encodeURIComponent).join("/");
}
