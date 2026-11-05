"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import type { DocMeta, NavGroup } from "@/lib/content";

/**
 * 서랍 안의 문서 트리.
 * 카테고리는 작은 라벨, 문서는 줄. 폴더로 중첩된 문서(slug 앞부분이 같은 문서)는
 * 부모 아래에 들여 쓰고 ▸/▾ 로 접고 펼친다. 현재 문서는 강조 + aria-current.
 */

interface TreeNode {
  doc: DocMeta;
  children: TreeNode[];
}

function buildTree(items: DocMeta[]): TreeNode[] {
  const byPath = new Map<string, TreeNode>();
  for (const doc of items) byPath.set(doc.slug.join("/"), { doc, children: [] });
  const roots: TreeNode[] = [];
  for (const doc of items) {
    const node = byPath.get(doc.slug.join("/"))!;
    // 가장 가까운 조상 문서를 찾는다 (a/b/c → a/b → a)
    let parent: TreeNode | undefined;
    for (let i = doc.slug.length - 1; i > 0 && !parent; i--) {
      parent = byPath.get(doc.slug.slice(0, i).join("/"));
    }
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function containsPath(node: TreeNode, pathname: string): boolean {
  return node.children.some(
    (c) => c.doc.url === pathname || containsPath(c, pathname)
  );
}

export function DocTree({
  nav,
  onNavigate,
}: {
  nav: NavGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = useMemo(
    () => nav.map((g) => ({ category: g.category, roots: buildTree(g.items) })),
    [nav]
  );
  // 사용자가 직접 접거나 편 노드. 값이 없으면 "현재 문서를 품고 있으면 펼침".
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  function isOpen(node: TreeNode) {
    const key = node.doc.url;
    if (key in toggled) return toggled[key];
    return node.doc.url === pathname || containsPath(node, pathname);
  }

  function renderNodes(nodes: TreeNode[], depth: number): React.ReactNode {
    return (
      <ul className="flex flex-col gap-px" role={depth === 0 ? undefined : "group"}>
        {nodes.map((node) => {
          const active = node.doc.url === pathname;
          const hasKids = node.children.length > 0;
          const open = hasKids && isOpen(node);
          return (
            <li key={node.doc.url}>
              <div
                className={`group flex items-center rounded-md text-[14px] leading-[1.35] transition-colors ${
                  active
                    ? "bg-sel font-semibold text-accent"
                    : "text-fg-2 hover:bg-hover"
                }`}
                style={{ paddingLeft: 4 + depth * 18 }}
              >
                {hasKids ? (
                  <button
                    type="button"
                    onClick={() =>
                      setToggled((t) => ({ ...t, [node.doc.url]: !open }))
                    }
                    aria-expanded={open}
                    aria-label={`${node.doc.title} ${open ? "접기" : "펼치기"}`}
                    className="grid size-5 flex-none place-items-center rounded text-fg-3 hover:bg-line-2"
                  >
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 10 10"
                      aria-hidden
                      className={`transition-transform ${open ? "rotate-90" : ""}`}
                    >
                      <path d="M3 1.5 7.5 5 3 8.5z" fill="currentColor" />
                    </svg>
                  </button>
                ) : (
                  <span className="w-5 flex-none" aria-hidden />
                )}
                <Link
                  href={node.doc.url}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className="min-w-0 flex-1 rounded-md py-[5px] pr-2 pl-1"
                >
                  {node.doc.title}
                </Link>
              </div>
              {open && renderNodes(node.children, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <nav aria-label="문서 트리">
      {groups.map((g) => (
        <section key={g.category} className="mt-3.5 first:mt-1">
          <h2 className="mx-2 mb-1 text-[11px] font-semibold tracking-[0.06em] text-fg-3">
            {g.category}
          </h2>
          {renderNodes(g.roots, 0)}
        </section>
      ))}
    </nav>
  );
}
