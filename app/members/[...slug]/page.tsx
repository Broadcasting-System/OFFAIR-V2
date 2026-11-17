import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDX } from "@/lib/mdx";
import { getAdjacent, getDoc } from "@/lib/content";
import { DocView } from "@/components/doc/doc-view";
import { LoginWall } from "@/components/members/login-wall";
import { pageAccess } from "@/lib/wiki/server-viewer";

/**
 * 부원 공간 문서 (/members/<slug…>). 요청마다 권한을 확인한다 — generateStaticParams 없음,
 * 빌드 결과·캐시에 부원 문서가 남지 않는다. 권한이 없으면 문서가 있든 없든 같은 로그인 벽.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const robots = { index: false, follow: false };
  const { canReadMembers } = await pageAccess();
  if (!canReadMembers) return { title: "부원 공간", robots };
  const { slug } = await params;
  const doc = getDoc(slug, "members");
  return { title: doc ? `${doc.title} · 부원 공간` : "부원 공간", robots };
}

function pathOf(slug: string[]): string {
  return "/members/" + slug.map((s) => encodeURIComponent(safeDecode(s))).join("/");
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export default async function MembersDocPage({ params }: PageProps) {
  const { slug } = await params;
  const { viewer, canReadMembers } = await pageAccess();
  if (!canReadMembers) return <LoginWall next={pathOf(slug)} mode={viewer.authenticated ? "forbidden" : "login"} />;

  const doc = getDoc(slug, "members");
  if (!doc) notFound();
  const { prev, next } = getAdjacent(slug, "members");

  return (
    <DocView doc={doc} prev={prev} next={next} space="members">
      <MDX source={doc.body} />
    </DocView>
  );
}
