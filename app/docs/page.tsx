import { redirect } from "next/navigation";
import { getFlatDocs } from "@/lib/content";
import { docHref } from "@/lib/wiki/links";
import { readGate } from "@/components/members/read-gate";

export const dynamic = "force-dynamic";

export default async function DocsIndex() {
  const wall = await readGate("/docs");
  if (wall) return wall;
  const first = getFlatDocs()[0];
  // 한글 경로는 인코딩해서 보낸다 (Location 머리글은 ASCII 만 된다)
  redirect(first ? docHref("guide", first.slug) : "/");
}
