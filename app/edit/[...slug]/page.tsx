import fs from "node:fs";
import { notFound } from "next/navigation";
import { DocEditor } from "@/components/dev/doc-editor";
import { IS_DEV, resolveContentPath } from "@/lib/dev";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

/** Map a content file to the public URL that renders it, if any. */
function toDocUrl(relPath: string): string | null {
  if (relPath === "contribution.mdx") return "/contribution";
  if (relPath.startsWith("docs/")) return "/" + relPath.replace(/\.mdx$/, "");
  return null;
}

export const metadata = { title: "Edit", robots: { index: false } };

export default async function EditPage({ params }: PageProps) {
  if (!IS_DEV) notFound();

  const { slug } = await params;
  const relPath = slug.join("/") + ".mdx";

  let full: string;
  try {
    full = resolveContentPath(relPath);
  } catch {
    notFound();
  }
  if (!fs.existsSync(full)) notFound();

  const source = fs.readFileSync(full, "utf8");

  return (
    <DocEditor
      relPath={relPath}
      initialSource={source}
      docUrl={toDocUrl(relPath)}
    />
  );
}
