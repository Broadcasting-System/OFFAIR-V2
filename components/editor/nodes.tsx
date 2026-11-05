"use client";

/**
 * MDX 컴포넌트마다의 편집 화면(노드 뷰).
 *   주의·정보·팁 상자(Callout) · 단계(Steps/Step) · 그림(Figure) · 카드(CardGrid/Card)
 *   · 유튜브 · 코드 블록 · 원문 블록/조각
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Icon } from "./icons";
import { DarkMenu } from "./dark-menu";
import { useEditorUi } from "./context";
import { pickFile, baseName } from "./upload";
import { parseMarkdown } from "@/lib/editor/mdast";
import { youtubeId } from "./insert";
import { CALLOUT_TYPES, type CalloutType } from "@/lib/editor/schema";

/* ───────────── 공용 ───────────── */

function useOutsideClose(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref]);
}

/** 노드 안 입력칸에서 Enter → 본문 첫 줄로 */
function jumpInto(props: NodeViewProps, offset = 2) {
  const pos = props.getPos();
  if (typeof pos !== "number") return;
  props.editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(pos + offset).run();
}

/** 새로 만든 단계/카드의 제목칸에 포커스를 주기 위한 표시 */
let pendingTitleFocus: number | null = null;
function useAutoFocusTitle(props: NodeViewProps, ref: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const pos = props.getPos();
    if (pendingTitleFocus != null && pos === pendingTitleFocus) {
      pendingTitleFocus = null;
      ref.current?.focus({ preventScroll: true });
    }
  });
}

function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

/* ───────────── 상자 (Callout) ───────────── */

export const CALLOUT_LABEL: Record<CalloutType, string> = {
  note: "메모",
  info: "정보",
  tip: "팁",
  warn: "주의",
  danger: "경고",
};

export function CalloutView(props: NodeViewProps) {
  const { node, updateAttributes, editor } = props;
  const type = (node.attrs.type ?? "note") as CalloutType;
  const [open, setOpen] = useState(false);
  const headRef = useRef<HTMLDivElement>(null);
  useOutsideClose(open, () => setOpen(false), headRef);
  return (
    <NodeViewWrapper className={`we-callout we-callout--${type}`} data-callout={type}>
      <div className="we-callout-head" contentEditable={false} ref={headRef}>
        <button
          type="button"
          className="we-callout-type"
          aria-haspopup="menu"
          aria-expanded={open}
          title="상자 종류 바꾸기"
          disabled={!editor.isEditable}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={type} size={16} />
          <span>{CALLOUT_LABEL[type]}</span>
          <Icon name="chev" size={10} />
        </button>
        <input
          className="we-callout-title"
          value={node.attrs.title ?? ""}
          placeholder="제목 (선택)"
          aria-label="상자 제목"
          disabled={!editor.isEditable}
          onChange={(e) => updateAttributes({ title: e.target.value || null })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              jumpInto(props);
            }
          }}
        />
        {open && (
          <DarkMenu
            className="we-menu--inline"
            ariaLabel="상자 종류"
            style={{ top: "calc(100% + 6px)", left: 0 }}
            entries={CALLOUT_TYPES.map((t) => ({ key: t, name: `${CALLOUT_LABEL[t]} 상자`, icon: t, check: t === type }))}
            onPick={(it) => {
              updateAttributes({ type: it.key });
              setOpen(false);
            }}
          />
        )}
      </div>
      <NodeViewContent className="we-callout-body" />
    </NodeViewWrapper>
  );
}

/* ───────────── 단계 (Steps / Step) ───────────── */

export function StepsView(props: NodeViewProps) {
  const { node, editor, getPos } = props;
  const add = () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const at = pos + node.nodeSize - 1;
    pendingTitleFocus = at;
    editor
      .chain()
      .insertContentAt(at, { type: "step", attrs: { title: "" }, content: [{ type: "paragraph" }] }, { updateSelection: false })
      .run();
  };
  return (
    <NodeViewWrapper className="we-steps">
      <NodeViewContent className="we-steps-list" />
      {editor.isEditable && (
        <button type="button" className="we-add" contentEditable={false} onMouseDown={(e) => e.preventDefault()} onClick={add}>
          <Icon name="add" size={14} /> 단계 추가
        </button>
      )}
    </NodeViewWrapper>
  );
}

/** 단계·카드 지우기 — 마지막 하나면 묶음째 지운다 */
function deleteChild(props: NodeViewProps) {
  const pos = props.getPos();
  if (typeof pos !== "number") return;
  const { state } = props.editor;
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  const tr = state.tr;
  if (parent.childCount <= 1) tr.delete($pos.before(), $pos.after());
  else tr.delete(pos, pos + props.node.nodeSize);
  props.editor.view.dispatch(tr);
}

export function StepView(props: NodeViewProps) {
  const { node, updateAttributes, editor } = props;
  const titleRef = useRef<HTMLInputElement>(null);
  useAutoFocusTitle(props, titleRef);
  return (
    <NodeViewWrapper className="we-step">
      <div className="we-step-head" contentEditable={false}>
        <span className="we-step-num" aria-hidden />
        <input
          ref={titleRef}
          className="we-step-title"
          value={node.attrs.title ?? ""}
          placeholder="단계 제목"
          aria-label="단계 제목"
          disabled={!editor.isEditable}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              jumpInto(props);
            }
          }}
        />
        {editor.isEditable && (
          <button type="button" className="we-x" title="이 단계 지우기" aria-label="이 단계 지우기" onMouseDown={(e) => e.preventDefault()} onClick={() => deleteChild(props)}>
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      <NodeViewContent className="we-step-body" />
    </NodeViewWrapper>
  );
}

/* ───────────── 카드 (CardGrid / Card) ───────────── */

export function CardGridView(props: NodeViewProps) {
  const { node, editor, getPos } = props;
  const add = () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const at = pos + node.nodeSize - 1;
    pendingTitleFocus = at;
    editor
      .chain()
      .insertContentAt(at, { type: "card", attrs: { href: null, title: "" }, content: [{ type: "paragraph" }] }, { updateSelection: false })
      .run();
  };
  return (
    <NodeViewWrapper className="we-cards">
      <NodeViewContent className="we-card-grid" />
      {editor.isEditable && (
        <button type="button" className="we-add" contentEditable={false} onMouseDown={(e) => e.preventDefault()} onClick={add}>
          <Icon name="add" size={14} /> 카드 추가
        </button>
      )}
    </NodeViewWrapper>
  );
}

export function CardView(props: NodeViewProps) {
  const { node, updateAttributes, editor } = props;
  const titleRef = useRef<HTMLInputElement>(null);
  useAutoFocusTitle(props, titleRef);
  return (
    <NodeViewWrapper className="we-card">
      <div className="we-card-head" contentEditable={false}>
        <input
          ref={titleRef}
          className="we-card-title"
          value={node.attrs.title ?? ""}
          placeholder="카드 제목"
          aria-label="카드 제목"
          disabled={!editor.isEditable}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              jumpInto(props);
            }
          }}
        />
        {editor.isEditable && (
          <button type="button" className="we-x" title="이 카드 지우기" aria-label="이 카드 지우기" onMouseDown={(e) => e.preventDefault()} onClick={() => deleteChild(props)}>
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      <label className="we-card-href" contentEditable={false}>
        <Icon name="link" size={13} />
        <input
          value={node.attrs.href ?? ""}
          placeholder="/docs/… 또는 https://…"
          aria-label="카드 링크 주소"
          disabled={!editor.isEditable}
          onChange={(e) => updateAttributes({ href: e.target.value || null })}
        />
      </label>
      <NodeViewContent className="we-card-body" />
    </NodeViewWrapper>
  );
}

/* ───────────── 그림 (Figure) ───────────── */

export function FigureView(props: NodeViewProps) {
  const { node, updateAttributes, editor, selected, deleteNode } = props;
  const ui = useEditorUi();
  const { src, alt, caption, width, height } = node.attrs as {
    src: string;
    alt: string;
    caption: string | null;
    width: number | null;
    height: number | null;
  };
  const replace = async () => {
    const file = await pickFile("image/*");
    if (!file) return;
    const up = await ui.uploadImage(file);
    if (up) updateAttributes({ src: up.url, width: up.width, height: up.height, alt: alt || baseName(file.name) });
  };
  const num = (v: string) => (v.trim() && /^\d+$/.test(v.trim()) ? Number(v) : null);
  return (
    <NodeViewWrapper className={`we-figure${selected ? " is-selected" : ""}`} data-drag-handle="">
      <div className="we-figure-frame">
        {src ? (
          // 편집 화면에서는 next/image 대신 그냥 img (주소가 바로 바뀌어야 해서)
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} draggable={false} />
        ) : (
          <button type="button" className="we-figure-empty" contentEditable={false} onClick={replace} disabled={!editor.isEditable}>
            <Icon name="upload" /> 이미지를 끌어 놓거나 눌러서 고르세요
          </button>
        )}
      </div>
      <AutoTextarea
        className="we-figure-caption"
        value={caption ?? ""}
        placeholder="캡션 (선택)"
        aria-label="그림 캡션"
        disabled={!editor.isEditable}
        onChange={(e) => updateAttributes({ caption: e.target.value.replace(/\n/g, " ") || null })}
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
      />
      {editor.isEditable && (
        <div className="we-figure-tools" contentEditable={false}>
          <label>
            대체 텍스트
            <input value={alt} onChange={(e) => updateAttributes({ alt: e.target.value })} placeholder="그림 설명" />
          </label>
          <label className="we-figure-size">
            크기
            <input inputMode="numeric" value={width ?? ""} onChange={(e) => updateAttributes({ width: num(e.target.value) })} placeholder="너비" aria-label="너비(px)" />
            ×
            <input inputMode="numeric" value={height ?? ""} onChange={(e) => updateAttributes({ height: num(e.target.value) })} placeholder="높이" aria-label="높이(px)" />
          </label>
          <label className="we-figure-check">
            <input type="checkbox" checked={Boolean(node.attrs.static)} onChange={(e) => updateAttributes({ static: e.target.checked })} />
            확대 끄기
          </label>
          <span className="we-sp" />
          <button type="button" onClick={replace}>
            <Icon name="upload" size={14} /> 바꾸기
          </button>
          <button type="button" className="is-danger" onClick={() => deleteNode()}>
            <Icon name="trash" size={14} /> 지우기
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

/* ───────────── 유튜브 ───────────── */

export function YoutubeView(props: NodeViewProps) {
  const { node, updateAttributes, editor, selected } = props;
  const id = youtubeId(node.attrs.url ?? "");
  return (
    <NodeViewWrapper className={`we-youtube${selected ? " is-selected" : ""}`} data-drag-handle="">
      <div className="we-youtube-frame" contentEditable={false}>
        {id ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`}
            title={node.attrs.title || "유튜브 영상"}
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="we-youtube-bad">유튜브 주소가 아니에요: {node.attrs.url}</div>
        )}
        {/* iframe 이 클릭을 먹어 블록을 고를 수 없으므로 고르기 전엔 덮개 */}
        {!selected && <div className="we-youtube-cover" />}
      </div>
      <AutoTextarea
        className="we-figure-caption"
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        value={node.attrs.title ?? ""}
        placeholder="영상 제목 (게시본에는 이 제목의 링크로 나와요)"
        aria-label="영상 제목"
        disabled={!editor.isEditable}
        onChange={(e) => updateAttributes({ title: e.target.value })}
      />
    </NodeViewWrapper>
  );
}

/* ───────────── 코드 블록 ───────────── */

export function CodeBlockView(props: NodeViewProps) {
  const { node, updateAttributes, editor } = props;
  return (
    <NodeViewWrapper className="we-codeblock">
      <div className="we-code-lang" contentEditable={false}>
        <input
          value={node.attrs.language ?? ""}
          placeholder="언어"
          aria-label="코드 언어"
          disabled={!editor.isEditable}
          onChange={(e) => updateAttributes({ language: e.target.value.trim() || null })}
        />
      </div>
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

/* ───────────── 원문 블록 / 원문 조각 ───────────── */

function mdxError(source: string): string | null {
  try {
    parseMarkdown(source);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message.split("\n")[0] : String(e);
  }
}

export function RawBlockView(props: NodeViewProps) {
  const { node, updateAttributes, editor, selected } = props;
  const source: string = node.attrs.source ?? "";
  const error = useMemo(() => mdxError(source), [source]);
  return (
    <NodeViewWrapper className={`we-raw${selected ? " is-selected" : ""}`}>
      <div className="we-raw-head" contentEditable={false} data-drag-handle="">
        <Icon name="raw" size={14} /> 원문 블록 · MDX
        <span className="we-raw-hint">편집기가 모르는 내용이라 글자 그대로 보관해요</span>
      </div>
      <AutoTextarea
        className="we-raw-src"
        value={source}
        spellCheck={false}
        aria-label="원문 MDX"
        disabled={!editor.isEditable}
        onChange={(e) => updateAttributes({ source: e.target.value })}
      />
      {error && <div className="we-raw-err">MDX 문법 오류 — {error}</div>}
    </NodeViewWrapper>
  );
}

export function RawInlineView(props: NodeViewProps) {
  const { node, updateAttributes, editor, selected } = props;
  const [editing, setEditing] = useState(false);
  const source: string = node.attrs.source ?? "";
  return (
    <NodeViewWrapper as="span" className={`we-raw-inline${selected ? " is-selected" : ""}`} title="원문 MDX 조각 — 두 번 눌러 고치기">
      {editing ? (
        <input
          autoFocus
          value={source}
          size={Math.max(4, source.length)}
          onChange={(e) => updateAttributes({ source: e.target.value })}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
              editor.commands.focus(undefined, { scrollIntoView: false });
            }
          }}
        />
      ) : (
        <span onDoubleClick={() => editor.isEditable && setEditing(true)}>{source}</span>
      )}
    </NodeViewWrapper>
  );
}
