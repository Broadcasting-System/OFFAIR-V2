import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WikiEditor } from "@/components/editor/wiki-editor";
import { getAllDocMeta, getCategoryOrder } from "@/lib/content";
import { docToMdx } from "@/lib/editor/doc-to-mdx";
import { DEFAULT_SPACE } from "@/lib/editor/space";

/**
 * 새 문서 쓰기 — /write/new?category=ONAIR%20원격%20제어
 * 경로는 게시할 때 제목으로 정한다 (docs/<제목-slug>).
 * TODO(백엔드 연결): 지금은 개발용 어댑터라 배포본(production)에서는 404.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "새 문서", robots: { index: false } };

interface PageProps {
  searchParams: Promise<{ category?: string | string[] }>;
}

export default async function NewDocPage({ searchParams }: PageProps) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const category = (Array.isArray(sp.category) ? sp.category[0] : sp.category)?.trim() ?? "";

  const all = getAllDocMeta();
  const order = all.filter((d) => d.category === category).reduce((m, d) => Math.max(m, d.order), 0) + 1;
  const initialMdx = docToMdx({
    meta: { title: "", description: "", category, order, extra: {} },
    doc: { type: "doc", content: [{ type: "paragraph" }] },
  });

  return (
    <WikiEditor
      space={DEFAULT_SPACE}
      path={null}
      initialMdx={initialMdx}
      initialRev={null}
      crumbs={["가이드북", category].filter(Boolean)}
      returnUrl="/docs"
      docs={all.map((d) => ({ title: d.title, url: d.url, category: d.category }))}
      categories={getCategoryOrder()}
    />
  );
}
