import { notFound } from "next/navigation";
import { HomeEditor } from "@/components/dev/home-editor";
import { IS_DEV } from "@/lib/dev";
import { getHomeConfig } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit · Home", robots: { index: false } };

export default function EditHomePage() {
  if (!IS_DEV) notFound();
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <h1 className="mb-6 font-display text-2xl font-extrabold text-fg">
        홈 화면 (히어로) 편집
      </h1>
      <HomeEditor initial={getHomeConfig()} />
    </div>
  );
}
