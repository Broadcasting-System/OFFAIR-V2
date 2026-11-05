import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WriteScreen } from "@/components/editor/write-screen";
import { LoginWall } from "@/components/members/login-wall";
import { getAllDocMeta, getCategoryOrder, spaceOf, type ContentSpace } from "@/lib/content";
import { SPACE_LABEL } from "@/lib/wiki/links";
import { pageAccess } from "@/lib/wiki/server-viewer";

/**
 * 문서 편집 — /write/<space>/<slug…> (예: /write/guide/onair-time, /write/members/meeting/2026-11).
 * 트리·검색·문서 위 막대의 "편집" 이 모두 editHref(space, slug) 로 이 주소를 만든다.
 * 요청마다 권한을 확인한다: 손님 → 로그인 벽, 읽기만 되는 사람 → "편집 권한이 없어요".
 * 저장은 편집기가 위키 API(PUT /api/wiki/<space>/docs/<slug>)로 한다 (lib/editor/wiki-client.ts).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "편집", robots: { index: false, follow: false } };

interface PageProps {
  params: Promise<{ space: string; slug: string[] }>;
}

function decode(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

export default async function WritePage({ params }: PageProps) {
  const { space: rawSpace, slug: rawSlug } = await params;
  if (rawSpace !== "guide" && rawSpace !== "members") notFound();
  const space = rawSpace as ContentSpace;
  const slug = rawSlug.map(decode);
  const here = `/write/${space}/${slug.map(encodeURIComponent).join("/")}`;

  const { viewer, canEdit, canReadMembers } = await pageAccess();
  if (!viewer.authenticated) return <LoginWall next={here} what="edit" />;
  if (space === "members" && !canReadMembers) return <LoginWall next={here} mode="forbidden" />;
  if (!canEdit) return <LoginWall next={here} mode="no-edit" what="edit" />;

  const sp = spaceOf(space);
  if (!sp) notFound();
  let doc = null;
  try {
    doc = sp.getDoc(slug);
  } catch {
    notFound();
  }
  if (!doc) notFound();

  const docs = getAllDocMeta(space).map((d) => ({ title: d.title, url: d.url, category: d.category }));

  return (
    <WriteScreen
      space={space}
      path={doc.slug.join("/")}
      initialMdx={doc.raw}
      initialRev={doc.rev}
      crumbs={[SPACE_LABEL[space], doc.category].filter(Boolean)}
      returnUrl={doc.url}
      docs={docs}
      categories={space === "guide" ? getCategoryOrder() : sp.categoryOrder()}
    />
  );
}
