"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "@/lib/content";

export function SidebarNav({ nav }: { nav: NavGroup[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-7" aria-label="문서 탐색">
      {nav.map((group) => (
        <div key={group.category}>
          <h5 className="mb-2.5 px-2 font-display text-[0.7rem] font-bold uppercase tracking-[0.18em] text-fg-faint">
            {group.category}
          </h5>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = pathname === item.url;
              return (
                <li key={item.url}>
                  <Link
                    href={item.url}
                    aria-current={active ? "page" : undefined}
                    className={`relative block rounded-md px-2 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-beam-500/10 font-medium text-beam-200"
                        : "text-fg-muted hover:bg-ink-800 hover:text-fg"
                    }`}
                  >
                    {active && (
                      <span className="absolute -left-px top-1/2 h-4 -translate-y-1/2 border-l-2 border-beam-500" />
                    )}
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
