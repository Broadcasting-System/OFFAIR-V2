import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDX } from "@/lib/mdx";
import { getAdjacent, getDoc } from "@/lib/content";
import { DocView } from "@/components/doc/doc-view";
import { canReadPages, pathOf, readGate } from "@/components/members/read-gate";
import { SPACE_LABEL } from "@/lib/wiki/links";

/**
 * 개발 문서 (/members/<slug…>, 내부 id 는 members 그대로). 요청마다 권한을 확인한다.
 * generateStaticParams 없음: 빌드 결과·캐시에 문서가 남지 않는다. 권한이 없으면 문서가 있든 없든 같은 로그인 벽.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const robots = { index: false, follow: false };
  const label = SPACE_LABEL.members;
  if (!(await canReadPages())) return { title: label, robots };
  const { slug } = await params;
  const doc = getDoc(slug, "members");
  return { title: doc ? `${doc.title} · ${label}` : label, robots };
}

export default async function MembersDocPage({ params }: PageProps) {
  const { slug } = await params;
  const wall = await readGate(pathOf("/members", slug));
  if (wall) return wall;

  const doc = getDoc(slug, "members");
  if (!doc) notFound();
  const { prev, next } = getAdjacent(slug, "members");

  return (
    <DocView doc={doc} prev={prev} next={next} space="members">
      <MDX source={doc.body} />
    </DocView>
  );
}
