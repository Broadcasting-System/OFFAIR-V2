import fs from "node:fs";
import { ArrowRightIcon } from "@/components/shell/icons";
import path from "node:path";
import matter from "gray-matter";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  SidebarManager,
  type ManagerGroup,
} from "@/components/dev/sidebar-manager";
import { getCategoryOrder, getNav } from "@/lib/content";
import { CONTENT_ROOT_DIR, IS_DEV } from "@/lib/dev";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit", robots: { index: false } };

function relToDocsPath(slug: string[]): string {
  return "docs/" + slug.join("/") + ".mdx";
}

/** Every .mdx under content/ that is NOT a sidebar doc (e.g. contribution). */
function listOtherFiles(): { relPath: string; title: string; url: string | null }[] {
  const out: { relPath: string; title: string; url: string | null }[] = [];
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(CONTENT_ROOT_DIR, full).replace(/\\/g, "/");
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith(".mdx") && !rel.startsWith("docs/")) {
        const { data } = matter(fs.readFileSync(full, "utf8"));
        out.push({
          relPath: rel,
          title: String(data.title ?? rel.replace(/\.mdx$/, "")),
          url: rel === "contribution.mdx" ? "/contribution" : null,
        });
      }
    }
  }
  walk(CONTENT_ROOT_DIR);
  return out;
}

export default function EditIndexPage() {
  if (!IS_DEV) notFound();

  const nav = getNav();
  const navByCategory = new Map(nav.map((g) => [g.category, g]));
  const categoryOrder = getCategoryOrder();

  // Include configured categories (even empty), then any extra categories
  // that have docs but aren't in the config.
  const seen = new Set<string>();
  const groups: ManagerGroup[] = [];
  const pushGroup = (category: string) => {
    if (seen.has(category)) return;
    seen.add(category);
    const g = navByCategory.get(category);
    groups.push({
      category,
      items: (g?.items ?? []).map((it) => ({
        relPath: relToDocsPath(it.slug),
        title: it.title,
        url: it.url,
      })),
    });
  };
  categoryOrder.forEach(pushGroup);
  nav.forEach((g) => pushGroup(g.category));

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
      <span className="rounded bg-amber-400/10 px-2 py-0.5 font-mono text-[0.7rem] font-semibold uppercase tracking-wider text-amber-300">
        Edit mode · dev only
      </span>
      <h1 className="mt-4 font-display text-3xl font-extrabold text-fg">
        문서 · 사이드바 관리
      </h1>
      <p className="mt-2 mb-6 text-fg-muted">
        문서를 추가·삭제하고, 드래그로 사이드바 구성을 자유롭게 바꿀 수 있습니다.
      </p>

      <Link
        href="/edit/home"
        className="group mb-8 flex items-center justify-between gap-4 rounded-xl border border-line bg-ink-900/50 px-4 py-3.5 transition-colors hover:border-beam-500/50"
      >
        <span>
          <span className="font-medium text-fg">홈 화면 (히어로) 편집</span>
          <span className="mt-0.5 block text-sm text-fg-muted">
            태그라인 · 제목 · 설명 · 버튼 텍스트/링크
          </span>
        </span>
        <span className="text-beam-400 transition-transform group-hover:translate-x-0.5">
          <ArrowRightIcon size={16} />
        </span>
      </Link>

      <SidebarManager initialGroups={groups} otherFiles={listOtherFiles()} />
    </div>
  );
}
