import { redirect } from "next/navigation";
import { getFlatDocs } from "@/lib/content";

export default function DocsIndex() {
  const first = getFlatDocs()[0];
  redirect(first ? first.url : "/");
}
