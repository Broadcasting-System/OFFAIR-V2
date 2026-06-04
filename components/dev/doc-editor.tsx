"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { ReactNode } from "react";
import { mdxComponents } from "@/components/mdx/mdx-components";
import { saveDoc } from "@/app/edit/actions";
import {
  detectSlash,
  filterSnippets,
  getCaretCoordinates,
  type Snippet,
} from "./slash";

interface DocEditorProps {
  relPath: string;
  initialSource: string;
  docUrl: string | null;
}

interface SlashState {
  start: number;
  query: string;
  top: number;
  left: number;
}

function stripFrontmatter(src: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(src);
  return m ? src.slice(m[0].length) : src;
}

export function DocEditor({ relPath, initialSource, docUrl }: DocEditorProps) {
  const router = useRouter();
  const [source, setSource] = useState(initialSource);
  const [preview, setPreview] = useState<ReactNode>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saved, setSaved] = useState<"idle" | "ok" | "error">("idle");
  const [pending, startSaving] = useTransition();

  const [slash, setSlash] = useState<SlashState | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);

  const dirty = source !== initialSource;
  const matches = useMemo(
    () => (slash ? filterSnippets(slash.query) : []),
    [slash]
  );
  const activeIndex = matches.length ? slashIndex % matches.length : 0;

  // Debounced client-side MDX compile for live preview.
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const [{ evaluate }, runtime, rehypeSlug, remarkGfm] =
          await Promise.all([
            import("@mdx-js/mdx"),
            import("react/jsx-runtime"),
            import("rehype-slug").then((m) => m.default),
            import("remark-gfm").then((m) => m.default),
          ]);
        const { default: Content } = await evaluate(stripFrontmatter(source), {
          ...runtime,
          remarkPlugins: [remarkGfm],
          rehypePlugins: [rehypeSlug],
        });
        if (!cancelled) {
          setPreview(<Content components={mdxComponents} />);
          setPreviewError(null);
        }
      } catch (e) {
        if (!cancelled)
          setPreviewError(e instanceof Error ? e.message : String(e));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [source]);

  // Restore caret after a programmatic insert.
  useEffect(() => {
    if (pendingCaret.current != null && taRef.current) {
      const pos = pendingCaret.current;
      taRef.current.focus();
      taRef.current.setSelectionRange(pos, pos);
      pendingCaret.current = null;
    }
  }, [source]);

  const refreshSlash = useCallback((value: string, caret: number) => {
    const ta = taRef.current;
    if (!ta) return;
    const d = detectSlash(value, caret);
    if (!d || filterSnippets(d.query).length === 0) {
      setSlash(null);
      return;
    }
    const c = getCaretCoordinates(ta, d.start);
    setSlash({
      start: d.start,
      query: d.query,
      top: c.top - ta.scrollTop + c.height + 4,
      left: c.left,
    });
    setSlashIndex(0);
  }, []);

  const insertSnippet = useCallback(
    (snippet: Snippet) => {
      const ta = taRef.current;
      if (!ta || !slash) return;
      const caret = ta.selectionStart;
      const cursorIdx = snippet.body.indexOf("$|");
      const text = snippet.body.replace("$|", "");
      const next = source.slice(0, slash.start) + text + source.slice(caret);
      pendingCaret.current =
        slash.start + (cursorIdx >= 0 ? cursorIdx : text.length);
      setSource(next);
      setSlash(null);
    },
    [slash, source]
  );

  const save = useCallback(() => {
    startSaving(async () => {
      const res = await saveDoc(relPath, source);
      if (res.ok) {
        setSaved("ok");
        router.refresh();
        setTimeout(() => setSaved("idle"), 2000);
      } else {
        setSaved("error");
        console.error(res.error);
      }
    });
  }, [relPath, source, router]);

  // ⌘S / Ctrl+S to save.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty) save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, save]);

  function onEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!slash || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSlashIndex((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSlashIndex((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertSnippet(matches[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSlash(null);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-ink-900/70 px-4 py-2.5 backdrop-blur">
        <Link
          href="/edit"
          className="text-fg-muted transition-colors hover:text-white"
          aria-label="문서 목록"
        >
          ←
        </Link>
        <span className="rounded bg-amber-400/10 px-2 py-0.5 font-mono text-[0.7rem] font-semibold uppercase tracking-wider text-amber-300">
          Edit mode
        </span>
        <code className="truncate font-mono text-xs text-fg-muted">
          content/{relPath}
        </code>
        <span className="hidden font-mono text-[0.7rem] text-fg-faint md:inline">
          <kbd className="rounded border border-line-strong px-1">/</kbd> 슬래시
          메뉴
        </span>
        {dirty && (
          <span className="size-1.5 rounded-full bg-amber-400" title="저장되지 않음" />
        )}

        <div className="ml-auto flex items-center gap-2">
          {saved === "ok" && (
            <span className="font-mono text-xs text-emerald-300">저장됨 ✓</span>
          )}
          {saved === "error" && (
            <span className="font-mono text-xs text-rose-300">저장 실패</span>
          )}
          {docUrl && (
            <Link
              href={docUrl}
              className="rounded-md border border-line px-3 py-1.5 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-white"
            >
              문서 보기
            </Link>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="rounded-md bg-beam-500 px-4 py-1.5 text-sm font-medium text-ink-950 transition-colors hover:bg-beam-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "저장 중…" : "저장"}
            <kbd className="ml-2 hidden font-mono text-[0.7rem] opacity-70 sm:inline">
              ⌘S
            </kbd>
          </button>
        </div>
      </div>

      {/* split panes */}
      <div className="grid min-h-0 flex-1 grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
        {/* editor */}
        <div className="relative min-h-0 border-b border-line lg:border-b-0 lg:border-r">
          <span className="pointer-events-none absolute right-3 top-2 z-10 font-mono text-[0.65rem] uppercase tracking-wider text-fg-faint">
            MDX
          </span>
          <textarea
            ref={taRef}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              refreshSlash(e.target.value, e.target.selectionStart);
            }}
            onKeyDown={onEditorKeyDown}
            onClick={() => setSlash(null)}
            onScroll={() => setSlash(null)}
            onBlur={() => setTimeout(() => setSlash(null), 120)}
            spellCheck={false}
            className="size-full resize-none bg-[#060a12] p-5 font-mono text-[0.82rem] leading-relaxed text-fg outline-none placeholder:text-fg-faint"
            placeholder="여기에 MDX를 작성하세요…  '/' 를 입력하면 컴포넌트 메뉴가 열립니다"
          />

          {slash && matches.length > 0 && (
            <SlashMenu
              matches={matches}
              activeIndex={activeIndex}
              top={slash.top}
              left={slash.left}
              onPick={insertSnippet}
              onHover={setSlashIndex}
            />
          )}
        </div>

        {/* preview */}
        <div className="relative min-h-0 overflow-y-auto bg-ink-950">
          <span className="pointer-events-none sticky top-2 z-10 ml-3 inline-block font-mono text-[0.65rem] uppercase tracking-wider text-fg-faint">
            Preview
          </span>
          <div className="px-6 py-6">
            {previewError ? (
              <pre className="whitespace-pre-wrap rounded-lg border border-rose-400/40 bg-rose-400/5 p-4 font-mono text-xs text-rose-300">
                {previewError}
              </pre>
            ) : (
              <div className="prose max-w-none">{preview}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SlashMenu({
  matches,
  activeIndex,
  top,
  left,
  onPick,
  onHover,
}: {
  matches: Snippet[];
  activeIndex: number;
  top: number;
  left: number;
  onPick: (s: Snippet) => void;
  onHover: (i: number) => void;
}) {
  let lastGroup = "";
  return (
    <div
      className="absolute z-30 max-h-72 w-64 overflow-y-auto rounded-lg border border-line-strong bg-ink-900/95 p-1 shadow-glow backdrop-blur"
      style={{ top: Math.max(8, top), left: Math.min(left, 320) }}
      role="listbox"
    >
      {matches.map((s, i) => {
        const header = s.group !== lastGroup ? s.group : null;
        lastGroup = s.group;
        return (
          <div key={s.label}>
            {header && (
              <p className="px-2 pb-1 pt-2 font-mono text-[0.6rem] uppercase tracking-wider text-fg-faint">
                {header}
              </p>
            )}
            <button
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => onHover(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(s);
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                i === activeIndex
                  ? "bg-beam-500/15 text-beam-200"
                  : "text-fg hover:bg-ink-800"
              }`}
            >
              <span className="truncate">{s.label}</span>
              <code className="shrink-0 font-mono text-[0.65rem] text-fg-faint">
                {s.hint}
              </code>
            </button>
          </div>
        );
      })}
    </div>
  );
}
