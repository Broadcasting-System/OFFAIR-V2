import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink-950">
      <div className="mx-auto flex max-w-[90rem] flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <div>
          <Logo withTagline />
          <p className="mt-3 text-xs text-fg-faint">
            © {new Date().getFullYear()} BSSM Broadcast · OFFAIR. 방송부 내부
            가이드 문서.
          </p>
        </div>
        <div className="flex gap-6 font-mono text-xs uppercase tracking-wider text-fg-muted">
          <a
            href="https://github.com/Broadcasting-System/OFFAIR-V2"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-beam-300"
          >
            GitHub
          </a>
          <a
            href="/docs/intro"
            className="transition-colors hover:text-beam-300"
          >
            Docs
          </a>
          <a
            href="/contribution"
            className="transition-colors hover:text-beam-300"
          >
            Contribute
          </a>
        </div>
      </div>
    </footer>
  );
}
