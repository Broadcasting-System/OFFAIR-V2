"use client";

/**
 * 글자를 고르면 뜨는 작은 서식 메뉴 (스프린터스식) — B I U S · 링크 · </> · 댓글.
 * 링크 안에 커서만 있으면 주소와 고치기/없애기를 보여 준다.
 * 종이(.we-paper) 안에 절대 위치로 놓아 스크롤을 따라 같이 움직인다.
 */
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { Icon } from "./icons";

interface Props {
  editor: Editor;
  paper: React.RefObject<HTMLElement | null>;
  commentMode: boolean;
  onComment: (range: { from: number; to: number }, text: string) => void;
  /** 늘어날 때마다 링크 입력을 연다 (⌘K) */
  linkRequest: number;
}

type Mode = "format" | "link" | "linkInfo";

export function BubbleMenu({ editor, paper, commentMode, onComment, linkRequest }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; bottom: number } | null>(null);
  const [href, setHref] = useState("");
  const [, force] = useState(0);
  const modeRef = useRef<Mode | null>(null);
  useLayoutEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const place = (from: number, to: number) => {
    const p = paper.current;
    if (!p) return;
    const view = editor.view;
    const a = view.coordsAtPos(from);
    const b = view.coordsAtPos(to);
    const pr = p.getBoundingClientRect();
    const center = a.top === b.top ? (a.left + b.left) / 2 : a.left + 40;
    setPos({ left: center - pr.left, top: Math.min(a.top, b.top) - pr.top, bottom: Math.max(a.bottom, b.bottom) - pr.top });
  };

  const update = useEffectEvent(() => {
    if (modeRef.current === "link") return; // 주소 입력 중에는 그대로
    const { state, view } = editor;
    const sel = state.selection;
    const focused = view.hasFocus() || Boolean(ref.current?.contains(document.activeElement));
    if (commentMode || !editor.isEditable || !focused) {
      setMode(null);
      return;
    }
    const inCode = sel.$from.parent.type.spec.code;
    if (sel instanceof TextSelection && !sel.empty && !inCode) {
      setMode("format");
      place(sel.from, sel.to);
      force((n) => n + 1);
      return;
    }
    if (sel.empty && editor.isActive("link")) {
      setHref(String(editor.getAttributes("link").href ?? ""));
      setMode("linkInfo");
      place(sel.from, sel.from);
      return;
    }
    setMode(null);
  });

  useEffect(() => {
    const run = () => update();
    const onBlur = () => setTimeout(run, 0);
    editor.on("selectionUpdate", run);
    editor.on("transaction", run);
    editor.on("focus", run);
    editor.on("blur", onBlur);
    return () => {
      editor.off("selectionUpdate", run);
      editor.off("transaction", run);
      editor.off("focus", run);
      editor.off("blur", onBlur);
    };
  }, [editor]);


  // 화면 밖으로 나가지 않게
  useLayoutEffect(() => {
    const el = ref.current;
    const p = paper.current;
    if (!el || !p || !pos) return;
    const w = el.offsetWidth;
    const left = Math.min(Math.max(0, pos.left - w / 2), p.clientWidth - w);
    el.style.left = left + "px";
    // 위에 자리가 없으면(스크롤 영역 맨 위) 선택 아래에 놓는다
    const scroller = p.closest(".we-scroll");
    const minTop = scroller ? scroller.getBoundingClientRect().top - p.getBoundingClientRect().top + 4 : 0;
    const above = pos.top - el.offsetHeight - 8;
    el.style.top = (above < minTop ? pos.bottom + 8 : above) + "px";
  });

  const openLink = () => {
    const sel = editor.state.selection;
    if (sel.empty && !editor.isActive("link")) return;
    setHref(String(editor.getAttributes("link").href ?? ""));
    place(sel.from, sel.to);
    setMode("link");
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };
  const openLinkEvent = useEffectEvent(openLink);

  const firstReq = useRef(linkRequest);
  useEffect(() => {
    if (linkRequest !== firstReq.current) openLinkEvent();
  }, [linkRequest]);

  const applyLink = () => {
    const v = href.trim();
    const chain = editor.chain().focus(undefined, { scrollIntoView: false }).extendMarkRange("link");
    if (!v) chain.unsetLink().run();
    else chain.setLink({ href: v }).run();
    setMode(null);
    modeRef.current = null;
  };

  if (!mode || commentMode) return null;
  const active = {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
    link: editor.isActive("link"),
    code: editor.isActive("code"),
  };

  return (
    <div
      ref={ref}
      className="we-bubble"
      role="toolbar"
      aria-label="글자 서식"
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest("input")) e.preventDefault();
      }}
    >
      {mode === "format" && (
        <>
          <Btn tip="굵게  ⌘B" active={active.bold} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></Btn>
          <Btn tip="기울임  ⌘I" active={active.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></Btn>
          <Btn tip="밑줄  ⌘U" active={active.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></Btn>
          <Btn tip="취소선  ⇧⌘S" active={active.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></Btn>
          <span className="we-bubble-div" />
          <Btn tip="링크  ⌘K" active={active.link} onClick={() => openLink()}><span className="we-bubble-txt">링크</span></Btn>
          <Btn tip="인라인 코드  ⌘E" active={active.code} onClick={() => editor.chain().focus().toggleCode().run()}><span className="we-bubble-txt">&lt;/&gt;</span></Btn>
          <span className="we-bubble-div" />
          <Btn
            tip="댓글 달기"
            onClick={() => {
              const { from, to } = editor.state.selection;
              onComment({ from, to }, editor.state.doc.textBetween(from, to, " "));
            }}
          >
            <Icon name="comment" size={16} />
          </Btn>
        </>
      )}
      {mode === "link" && (
        <form
          className="we-bubble-link"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <input
            ref={inputRef}
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="주소 붙여넣기 (https://… 또는 /docs/…)"
            aria-label="링크 주소"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setMode(null);
                modeRef.current = null;
                editor.commands.focus(undefined, { scrollIntoView: false });
              }
            }}
          />
          <button type="submit" className="we-bubble-ok">적용</button>
          {editor.isActive("link") && (
            <button type="button" onClick={() => { setHref(""); editor.chain().focus().extendMarkRange("link").unsetLink().run(); setMode(null); }}>
              없애기
            </button>
          )}
        </form>
      )}
      {mode === "linkInfo" && (
        <div className="we-bubble-info">
          <a href={href} target="_blank" rel="noopener noreferrer" title={href}>
            <Icon name="external" size={14} /> <span>{href}</span>
          </a>
          <span className="we-bubble-div" />
          <button type="button" onClick={() => openLink()}>고치기</button>
          <button type="button" onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}>없애기</button>
        </div>
      )}
    </div>
  );
}

function Btn({ tip, active = false, onClick, children }: { tip: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={active ? "on" : ""} aria-label={tip.split("  ")[0]} aria-pressed={active} data-tip={tip} onClick={onClick}>
      {children}
    </button>
  );
}
