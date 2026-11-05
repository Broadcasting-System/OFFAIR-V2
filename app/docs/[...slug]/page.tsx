import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDX } from "@/lib/mdx";
import { getAdjacent, getAllSlugs, getDoc } from "@/lib/content";
import { DocView } from "@/components/doc/doc-view";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
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
  const doc = getDoc(slug);
  if (!doc) notFound();

  const { prev, next } = getAdjacent(slug);

  return (
    <DocView doc={doc} prev={prev} next={next}>
      <MDX source={doc.body} />
    </DocView>
  );
}
