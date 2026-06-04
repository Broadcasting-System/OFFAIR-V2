import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDX } from "@/lib/mdx";
import { Toc } from "@/components/toc";
import { EditFab } from "@/components/dev/edit-fab";
import { getAdjacent, getAllSlugs, getDoc } from "@/lib/content";

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
    <div className="flex gap-10 px-5 py-10 sm:px-8 lg:px-12 xl:px-16">
      <article className="min-w-0 flex-1">
        <header className="mb-8 border-b border-line pb-7">
          <p className="mb-3 font-display text-[0.7rem] uppercase tracking-[0.22em] text-beam-400">
            {doc.category}
          </p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {doc.title}
          </h1>
          {doc.description && (
            <p className="mt-3 text-lg text-fg-muted">{doc.description}</p>
          )}
        </header>

        <div className="prose max-w-none">
          <MDX source={doc.body} />
        </div>

        <PrevNext prev={prev} next={next} />
      </article>

      {/* Right TOC (xl+) */}
      <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-56 shrink-0 overflow-y-auto py-10 xl:block">
        <Toc items={doc.toc} />
      </aside>

      <EditFab relPath={`docs/${slug.join("/")}.mdx`} />
    </div>
  );
}

function PrevNext({
  prev,
  next,
}: {
  prev: { url: string; title: string } | null;
  next: { url: string; title: string } | null;
}) {
  if (!prev && !next) return null;
  return (
    <nav className="mt-14 grid gap-4 border-t border-line pt-8 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.url}
          className="group rounded-lg border border-line p-4 transition-colors hover:border-beam-500/50"
        >
          <span className="font-mono text-xs uppercase tracking-wider text-fg-faint">
            ← 이전
          </span>
          <span className="mt-1 block font-medium text-fg group-hover:text-white">
            {prev.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          href={next.url}
          className="group rounded-lg border border-line p-4 text-right transition-colors hover:border-beam-500/50 sm:col-start-2"
        >
          <span className="font-mono text-xs uppercase tracking-wider text-fg-faint">
            다음 →
          </span>
          <span className="mt-1 block font-medium text-fg group-hover:text-white">
            {next.title}
          </span>
        </Link>
      )}
    </nav>
  );
}
