import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WikiEditor } from "@/components/editor/wiki-editor";
import { getAllDocMeta } from "@/lib/content";
import { docUrlOf } from "@/lib/editor/paths";
import { DEFAULT_SPACE } from "@/lib/editor/space";
import { devGetDoc } from "../actions";

/**
 * 문서 편집 — /write/docs/onair-time 은 content/docs/onair-time.mdx 를 고친다.
 * TODO(백엔드 연결): 지금은 개발용 어댑터라 배포본(production)에서는 404.
 * feat/wiki-backend 가 들어오면 문서 읽기를 그쪽 저장소로 바꾸고 권한 확인을 붙인다.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "편집", robots: { index: false } };

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

function decode(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

export default async function WritePage({ params }: PageProps) {
  if (process.env.NODE_ENV === "production") notFound();
  const { slug } = await params;
  const path = slug.map(decode).join("/");

  let doc: Awaited<ReturnType<typeof devGetDoc>> = null;
  try {
    doc = await devGetDoc(DEFAULT_SPACE, path);
  } catch {
    notFound();
  }
  if (!doc) notFound();

  const docs = getAllDocMeta().map((d) => ({ title: d.title, url: d.url, category: d.category }));

  return (
    <WikiEditor
      space={DEFAULT_SPACE}
      path={path}
      initialMdx={doc.mdx}
      initialRev={doc.rev}
      crumbs={["가이드북", doc.meta.category].filter(Boolean)}
      returnUrl={docUrlOf(path)}
      docs={docs}
    />
  );
}
