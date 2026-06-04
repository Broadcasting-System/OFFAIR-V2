import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-7xl font-extrabold text-white text-glow">
        OFF<span className="text-beam-400">AIR</span>
      </p>
      <p className="mt-4 font-mono text-sm uppercase tracking-[0.2em] text-fg-faint">
        404 · Signal lost
      </p>
      <p className="mt-3 max-w-sm text-fg-muted">
        찾으시는 문서가 송출 중이 아닙니다. 페이지가 이동했거나 삭제되었을 수
        있어요.
      </p>
      <Link
        href="/"
        className="mt-7 rounded-lg bg-beam-500 px-5 py-2.5 font-medium text-ink-950 transition-colors hover:bg-beam-400"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
