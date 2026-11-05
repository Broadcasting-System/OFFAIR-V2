import Link from "next/link";

/** 본문 칼럼 맨 아래의 작은 바닥글. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line-2">
      <div className="flex flex-col gap-2 px-4 py-6 text-xs text-fg-3 sm:flex-row sm:items-center sm:justify-between sm:px-[22px]">
        <p>
          © {new Date().getFullYear()} BSSM Broadcast · OFFAIR · Made by BSSM
          Broadcaster 4th · 서정현
        </p>
        <nav aria-label="바닥글" className="flex gap-4">
          <Link href="/contribution" className="rounded hover:text-fg">
            문서 기여하기
          </Link>
          <a
            href="https://github.com/Broadcasting-System/OFFAIR-V2"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded hover:text-fg"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
