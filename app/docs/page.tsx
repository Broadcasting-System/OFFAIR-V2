import { redirect } from "next/navigation";
import { getFlatDocs } from "@/lib/content";
import { docHref } from "@/lib/wiki/links";

export default function DocsIndex() {
  const first = getFlatDocs()[0];
  // 한글 경로는 인코딩해서 보낸다 (Location 머리글은 ASCII 만 된다)
  redirect(first ? docHref("guide", first.slug) : "/");
}
