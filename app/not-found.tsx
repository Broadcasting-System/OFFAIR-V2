import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center outline-none"
    >
      <p className="text-[56px] leading-none font-extrabold tracking-[0.04em] text-fg">
        404
      </p>
      <h1 className="mt-4 text-[20px] font-bold text-fg">문서를 찾을 수 없어요</h1>
      <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-fg-2">
        페이지가 옮겨졌거나 지워졌을 수 있어요. 왼쪽 문서 트리나 검색(⌘K)으로
        찾아보세요.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
      >
        홈으로
      </Link>
    </main>
  );
}
