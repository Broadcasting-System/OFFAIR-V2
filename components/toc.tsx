"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/content";

/** "On this page" navigation with scroll-spy highlighting. */
export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    if (items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );

    const nodes = items
      .map((i) => document.getElementById(i.id))
      .filter((n): n is HTMLElement => n !== null);
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="이 페이지의 목차" className="text-sm">
      <p className="mb-3 flex items-center gap-2 font-display text-[0.7rem] font-bold uppercase tracking-[0.18em] text-fg-faint">
        <span className="size-1.5 rotate-45 bg-beam-500" aria-hidden />
        On this page
      </p>
      <ul className="flex flex-col gap-1 border-l border-line">
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`-ml-px block border-l py-1 transition-colors ${
                  item.level === 3 ? "pl-6" : "pl-3"
                } ${
                  isActive
                    ? "border-beam-500 text-beam-300"
                    : "border-transparent text-fg-muted hover:text-fg"
                }`}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
