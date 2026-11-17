"use client";

import { useEffect, useRef, useState } from "react";
import type { Mention } from "@/lib/wiki/comments-client";
import { Avatar } from "@/components/ui/avatar";

/**
 * 댓글 입력 칸. `@` 를 쓰면 부원 목록이 떠서 고르면 "@이름 " 이 들어가고 부르기(mentions)에 남는다.
 * ↵ 보내기 · ⇧↵ 줄바꿈 · Esc 취소. 글이 늘면 칸도 늘어난다.
 */
export function MentionInput({
  people,
  placeholder,
  submitLabel = "보내기",
  initial = "",
  initialMentions = [],
  autoFocus = false,
  compact = false,
  onSubmit,
  onCancel,
}: {
  people: Mention[];
  placeholder: string;
  submitLabel?: string;
  initial?: string;
  initialMentions?: Mention[];
  autoFocus?: boolean;
  compact?: boolean;
  onSubmit: (body: string, mentions: Mention[]) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [mentions, setMentions] = useState<Mention[]>(initialMentions);
  const [query, setQuery] = useState<string | null>(null);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 200)}px`;
    el.style.overflowY = el.scrollHeight > 200 ? "auto" : "hidden";
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const matches = query === null ? [] : people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  function detect(text: string, caret: number) {
    const m = /(^|\s)@([^\s@]{0,20})$/.exec(text.slice(0, caret));
    setQuery(m ? m[2] : null);
    setPick(0);
  }

  function choose(p: Mention) {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart;
    const before = value.slice(0, caret).replace(/@([^\s@]{0,20})$/, `@${p.name} `);
    const next = before + value.slice(caret);
    setValue(next);
    setMentions((ms) => (ms.some((x) => x.memberId === p.memberId) ? ms : [...ms, p]));
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  }

  async function submit() {
    const body = value.trim();
    if (!body || busy) return;
    setBusy(true);
    const ok = await onSubmit(body, mentions);
    setBusy(false);
    if (ok) {
      setValue("");
      setMentions([]);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    if (matches.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setPick((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choose(matches[pick]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape" && onCancel) {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className="relative flex min-w-0 flex-1 items-end gap-2" data-cmt-ui>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        className={`min-w-0 flex-1 resize-none rounded-lg border border-line bg-bg text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] ${
          compact ? "px-2.5 py-[7px] text-[13px]" : "px-3 py-[9px] text-[14px]"
        }`}
      />
      {(!compact || value.trim()) && (
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || busy}
          className={`flex-none rounded-md bg-accent font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50 ${compact ? "h-[30px] px-2.5 text-[12.5px]" : "h-[34px] px-3 text-[13px]"}`}
        >
          {busy ? "…" : submitLabel}
        </button>
      )}
      {matches.length > 0 && (
        <ul role="listbox" aria-label="부를 사람" className="absolute bottom-full left-0 z-30 mb-1 min-w-[180px] overflow-hidden rounded-lg border border-line bg-bg p-1 shadow-pop">
          {matches.map((p, i) => (
            <li key={p.memberId} role="option" aria-selected={i === pick}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-fg ${i === pick ? "bg-sel" : "hover:bg-hover"}`}
              >
                <Avatar name={p.name} size={20} />
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
