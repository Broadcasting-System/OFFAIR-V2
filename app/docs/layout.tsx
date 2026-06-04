import { SidebarNav } from "@/components/sidebar-nav";
import { getNav } from "@/lib/content";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nav = getNav();

  return (
    <div className="mx-auto flex max-w-[90rem] px-0 sm:px-6 lg:px-8">
      {/* Left sidebar (desktop) */}
      <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-line py-8 pr-4 lg:block">
        <SidebarNav nav={nav} />
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
