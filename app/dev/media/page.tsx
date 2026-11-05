import { notFound } from "next/navigation";
import { IS_DEV } from "@/lib/dev";
import { MediaDemo } from "./demo";

export const metadata = { title: "미디어 데모", robots: { index: false } };

/** 개발 전용 — 넣기 창·표시 달기 데모. 프로덕션에서는 404. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!IS_DEV) notFound();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  return <MediaDemo open={one("open")} tab={one("tab")} theme={one("theme")} />;
}
