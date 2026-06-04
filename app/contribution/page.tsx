import type { Metadata } from "next";
import { MDX } from "@/lib/mdx";
import { EditFab } from "@/components/dev/edit-fab";
import fs from "node:fs";
import path from "node:path";

export const metadata: Metadata = {
  title: "Contribution",
  description: "OFFAIR 가이드북 문서를 작성·수정하는 방법",
};

export default async function ContributionPage() {
  const source = fs.readFileSync(
    path.join(process.cwd(), "content", "contribution.mdx"),
    "utf8"
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
      <header className="mb-8 border-b border-line pb-7">
        <p className="mb-3 font-display text-[0.7rem] uppercase tracking-[0.22em] text-beam-400">
          Contribution
        </p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          문서 기여 가이드
        </h1>
        <p className="mt-3 text-lg text-fg-muted">
          새 문서를 추가하거나 기존 문서를 다듬는 방법.
        </p>
      </header>
      <div className="prose max-w-none">
        <MDX source={source} />
      </div>
      <EditFab relPath="contribution.mdx" />
    </div>
  );
}
