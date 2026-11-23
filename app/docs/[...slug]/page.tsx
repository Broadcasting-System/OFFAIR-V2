import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDX } from "@/lib/mdx";
import { getAdjacent, getDoc } from "@/lib/content";
import { DocView } from "@/components/doc/doc-view";
import { canReadPages, pathOf, readGate } from "@/components/members/read-gate";

/**
 * 가이드북 문서 (/docs/<slug…>). 부원 전용이라 요청마다 권한을 확인한다.
 * generateStaticParams 없음: 빌드 결과·정적 HTML 에 가이드북 본문이 남지 않는다.
 * 권한이 없으면 문서가 있든 없든 같은 로그인 벽.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  if (!(await canReadPages())) return { title: "가이드북" };
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) return {};
  return {
    title: doc.title,
    description: doc.description || undefined,
  };
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const wall = await readGate(pathOf("/docs", slug));
  if (wall) return wall;
  const doc = getDoc(slug);
  if (!doc) notFound();

  const { prev, next } = getAdjacent(slug);

  return (
    <DocView doc={doc} prev={prev} next={next}>
      <MDX source={doc.body} />
    </DocView>
  );
}
