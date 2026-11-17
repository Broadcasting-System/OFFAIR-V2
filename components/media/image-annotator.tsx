"use client";

/**
 * 표시 달기 — 그림 한 장에 번호·상자·화살표·글·가리기·자르기를 하는 전체 화면 편집기.
 * 시안: f5-upload D.
 *
 *   <ImageAnnotator src file? name? initial? onCancel onDone({blob, baseBlob, caption, sidecar, width, height}) />
 *
 * - 좌표는 그림 픽셀 기준 (SVG viewBox = 그림 크기). 화면 크기가 바뀌어도 그대로.
 * - 가리기는 미리보기 canvas 에서 바로 모자이크로 보이고, 내보낼 때 픽셀에 구워진다.
 * - 내보낸 base(가리기·자르기만 적용)와 사이드카로 나중에 다시 고칠 수 있다.
 */

import "./media.css";

import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { circled, legendToCaption } from "@/lib/media/annotate/caption";
import {
  clamp,
  handlesFor,
  hitHandle,
  hitTest,
  markBounds,
  metricsFor,
  numberMarks,
  rectFromPoints,
  resizeMark,
  roundRect,
  textBox,
  translateMark,
  type HandleId,
  type MarkMetrics,
} from "@/lib/media/annotate/geometry";
import { historyReducer, initHistory, type History, type HistoryAction } from "@/lib/media/annotate/history";
import { pixelate } from "@/lib/media/annotate/redact";
import {
  arrowGeometry,
  DEFAULT_FONT_FAMILY,
  exportAnnotation,
  fontString,
  NUMBER_WEIGHT,
  TEXT_WEIGHT,
} from "@/lib/media/annotate/render";
import { fitSidecarTo, parseSidecar, roundMark } from "@/lib/media/annotate/sidecar";
import {
  MARK_COLORS,
  type AnnotationDoc,
  type AnnotationSidecar,
  type Mark,
  type MarkColor,
  type Point,
  type Rect,
} from "@/lib/media/annotate/types";
import type { AnnotatorResult } from "@/lib/media/client";

import {
  IconArrow,
  IconBox,
  IconCrop,
  IconNumber,
  IconRedact,
  IconRedo,
  IconSelect,
  IconText,
  IconTrash,
  IconUndo,
} from "./icons";
import { useIsClient, useModal } from "./use-modal";

export type { AnnotatorResult } from "@/lib/media/client";

export interface ImageAnnotatorProps {
  /** 그림 주소. 같은 출처(/uploads/…)이거나 CORS 를 허용하는 주소여야 내보낼 수 있다. */
  src: string;
  /** 주면 src 대신 이 파일을 연다 (아직 안 올린 그림) */
  file?: Blob;
  /** 제목 줄에 보일 이름 */
  name?: string;
  /** 다시 고치기 — 예전에 받은 사이드카. 이때 src 는 sidecar.base 여야 한다. */
  initial?: AnnotationSidecar;
  /** 완료 버튼 글 (기본 "본문에 넣기") */
  doneLabel?: string;
  onCancel: () => void;
  onDone: (result: AnnotatorResult) => void | Promise<void>;
}

type Tool = "select" | "number" | "box" | "arrow" | "text" | "redact" | "crop";

const TOOLS: { id: Tool; label: string; key: string; num: string; icon: ReactNode }[] = [
  { id: "select", label: "고르기", key: "V", num: "1", icon: <IconSelect /> },
  { id: "number", label: "번호", key: "N", num: "2", icon: <IconNumber /> },
  { id: "box", label: "상자", key: "B", num: "3", icon: <IconBox /> },
  { id: "arrow", label: "화살표", key: "A", num: "4", icon: <IconArrow /> },
  { id: "text", label: "글", key: "T", num: "5", icon: <IconText /> },
  { id: "redact", label: "가리기", key: "M", num: "6", icon: <IconRedact /> },
];
const CROP_TOOL = { id: "crop" as const, label: "자르기", key: "C", num: "7", icon: <IconCrop /> };
const ALL_TOOLS = [...TOOLS, CROP_TOOL];
const COLORS: MarkColor[] = ["red", "blue", "yellow"];


const docReducer = (h: History<AnnotationDoc>, a: HistoryAction<AnnotationDoc>) => historyReducer(h, a);

let idSeq = 0;
function newId(): string {
  idSeq += 1;
  return `m${Date.now().toString(36)}${idSeq.toString(36)}`;
}

/* 글 폭 재기 — SVG 에서 글 상자 크기를 canvas 와 똑같이 맞추려고 같은 방식으로 잰다 */
let measureCtx: CanvasRenderingContext2D | null = null;
function measureWith(family: string) {
  return (text: string, size: number) => {
    if (typeof document === "undefined") return text.length * size * 0.8;
    measureCtx ??= document.createElement("canvas").getContext("2d");
    if (!measureCtx) return text.length * size * 0.8;
    measureCtx.font = fontString(TEXT_WEIGHT, size, family);
    return measureCtx.measureText(text).width;
  };
}

interface Loaded {
  img: HTMLImageElement;
  w: number;
  h: number;
  family: string;
}

type Drag =
  | { kind: "move"; id: string; start: Point; orig: Mark; began: boolean }
  | { kind: "resize"; id: string; handle: HandleId; orig: Mark; began: boolean }
  | { kind: "create"; type: "box" | "arrow" | "redact" | "crop"; start: Point };

interface Draft {
  type: "box" | "arrow" | "redact" | "crop";
  start: Point;
  cur: Point;
}

interface TextEdit {
  id: string | null;
  x: number;
  y: number;
  value: string;
  color: MarkColor;
}

const LEGEND_RESERVE = 64;

export function ImageAnnotator({
  src,
  file,
  name,
  initial,
  doneLabel = "본문에 넣기",
  onCancel,
  onDone,
}: ImageAnnotatorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const workRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const labelBegunRef = useRef(false);
  const filterId = useId().replace(/:/g, "");

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hist, dispatch] = useReducer(docReducer, { marks: [], crop: null }, initHistory);
  const [tool, setTool] = useState<Tool>("number");
  const [color, setColor] = useState<MarkColor>("red");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingCrop, setPendingCrop] = useState<Rect | null>(null);
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doc = hist.present;
  const marks = doc.marks;
  const isClient = useIsClient();

  useModal(rootRef, isClient, "[data-autofocus]");

  /* ── 그림 불러오기 ── */
  useEffect(() => {
    let alive = true;
    const url = file ? URL.createObjectURL(file) : src;
    const img = new Image();
    img.decoding = "async";
    if (!file && /^https?:/i.test(src)) {
      try {
        if (new URL(src).origin !== window.location.origin) img.crossOrigin = "anonymous";
      } catch {
        /* 상대 주소 */
      }
    }
    img.onload = () => {
      if (!alive) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const family = rootRef.current ? getComputedStyle(rootRef.current).fontFamily : DEFAULT_FONT_FAMILY;
      let startMarks: Mark[] = [];
      if (initial) {
        try {
          startMarks = fitSidecarTo(parseSidecar(initial), w, h);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
      dispatch({ type: "reset", present: { marks: startMarks, crop: null } });
      setLoaded({ img, w, h, family: family || DEFAULT_FONT_FAMILY });
      if (startMarks.length) setTool("select");
    };
    img.onerror = () => {
      if (alive) setLoadError("그림을 불러오지 못했어요");
    };
    img.src = url;
    return () => {
      alive = false;
      if (file) URL.revokeObjectURL(url);
    };
  }, [src, file, initial]);

  /* ── 작업대 크기 ── */
  useEffect(() => {
    const el = workRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setAvail({ w: Math.max(0, w), h: Math.max(0, h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isClient]);

  const W = loaded?.w ?? 1;
  const H = loaded?.h ?? 1;
  const mt: MarkMetrics = useMemo(() => metricsFor(W, H), [W, H]);
  const family = loaded?.family ?? DEFAULT_FONT_FAMILY;
  const measure = useMemo(() => measureWith(family), [family]);

  const full: Rect = { x: 0, y: 0, w: W, h: H };
  const view: Rect = tool === "crop" ? full : (doc.crop ?? full);
  const narrow = avail.w < 560;
  const scale = Math.min(
    avail.w / view.w,
    Math.max(120, avail.h - (narrow ? 0 : LEGEND_RESERVE)) / view.h,
    1
  );
  const stageW = Math.max(1, Math.round(view.w * scale));
  const stageH = Math.max(1, Math.round(view.h * scale));
  /** 화면 1px 이 그림 몇 px 인지 */
  const px = view.w / stageW;

  /* ── 미리보기 canvas: 원본 + 가리기 모자이크 ── */
  const redactKey = JSON.stringify(marks.filter((m) => m.type === "redact").map((m) => [m.x, m.y, m.w, m.h]));
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !loaded) return;
    if (c.width !== loaded.w || c.height !== loaded.h) {
      c.width = loaded.w;
      c.height = loaded.h;
    }
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(loaded.img, 0, 0);
    const rects = JSON.parse(redactKey) as [number, number, number, number][];
    for (const [x, y, w, h] of rects) {
      const r = roundRect({ x, y, w, h });
      const cx = clamp(r.x, 0, loaded.w);
      const cy = clamp(r.y, 0, loaded.h);
      const cw = clamp(r.x + r.w, 0, loaded.w) - cx;
      const ch = clamp(r.y + r.h, 0, loaded.h) - cy;
      if (cw <= 0 || ch <= 0) continue;
      try {
        const data = ctx.getImageData(cx, cy, cw, ch);
        // 내보내기와 같은 칸 정렬: 칸은 가리기 상자 왼쪽 위에서 시작
        pixelate(data, { x: r.x - cx, y: r.y - cy, w: r.w, h: r.h }, mt.block);
        ctx.putImageData(data, cx, cy);
      } catch {
        /* 다른 출처 그림 — 미리보기는 못 하지만 내보낼 때 오류로 알린다 */
      }
    }
  }, [loaded, redactKey, mt.block]);

  /* ── 좌표 ── */
  function toImg(e: { clientX: number; clientY: number }): Point {
    const r = stageRef.current!.getBoundingClientRect();
    return {
      x: view.x + ((e.clientX - r.left) / r.width) * view.w,
      y: view.y + ((e.clientY - r.top) / r.height) * view.h,
    };
  }
  const clampPt = (p: Point): Point => ({ x: clamp(p.x, 0, W), y: clamp(p.y, 0, H) });

  /* ── 상태 바꾸기 ── */
  const commit = (next: AnnotationDoc) => dispatch({ type: "commit", next });
  const setMarks = (next: Mark[]) => commit({ ...doc, marks: next });
  const selected = marks.find((m) => m.id === selectedId) ?? null;

  function applyCrop(rect: Rect | null) {
    if (!rect) return;
    const r = roundRect(rect);
    const isFull = r.x <= 0 && r.y <= 0 && r.w >= W && r.h >= H;
    commit({ ...doc, crop: isFull ? null : r });
    setPendingCrop(null);
  }

  function chooseTool(t: Tool) {
    if (tool === "crop" && t !== "crop" && pendingCrop) applyCrop(pendingCrop);
    if (t === "crop") setPendingCrop(doc.crop);
    setTool(t);
    setDraft(null);
    if (t !== "select") setSelectedId(null);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setMarks(marks.filter((m) => m.id !== selectedId));
    setSelectedId(null);
  }

  function undo() {
    dispatch({ type: "undo" });
    setSelectedId(null);
  }
  function redo() {
    dispatch({ type: "redo" });
    setSelectedId(null);
  }

  /* ── 글 표시 ── */
  function commitText() {
    if (!textEdit) return;
    const value = textEdit.value.trim();
    if (textEdit.id) {
      const id = textEdit.id;
      if (!value) setMarks(marks.filter((m) => m.id !== id));
      else setMarks(marks.map((m) => (m.id === id && m.type === "text" ? { ...m, text: value } : m)));
    } else if (value) {
      const m: Mark = { id: newId(), type: "text", x: textEdit.x, y: textEdit.y, text: value, color: textEdit.color };
      setMarks([...marks, m]);
      setSelectedId(m.id);
    }
    setTextEdit(null);
  }

  function editText(m: Mark) {
    if (m.type !== "text") return;
    setTextEdit({ id: m.id, x: m.x, y: m.y, value: m.text, color: m.color });
  }

  /* ── 포인터 ── */
  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (!loaded || busy) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (textEdit) {
      commitText();
      return;
    }
    const p = toImg(e);
    const tol = (e.pointerType === "touch" ? 12 : 6) * px;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();

    switch (tool) {
      case "select": {
        if (selected) {
          const h = hitHandle(selected, p, tol + 2 * px);
          if (h) {
            dragRef.current = { kind: "resize", id: selected.id, handle: h, orig: selected, began: false };
            return;
          }
        }
        const hit = hitTest(marks, p, mt, tol, measure);
        if (hit) {
          setSelectedId(hit.id);
          dragRef.current = { kind: "move", id: hit.id, start: p, orig: hit, began: false };
        } else setSelectedId(null);
        return;
      }
      case "number": {
        const q = clampPt(p);
        const m: Mark = { id: newId(), type: "number", x: q.x, y: q.y, color, label: "" };
        setMarks([...marks, m]);
        return;
      }
      case "text": {
        const q = clampPt(p);
        setTextEdit({ id: null, x: q.x, y: q.y, value: "", color });
        return;
      }
      default: {
        const q = clampPt(p);
        dragRef.current = { kind: "create", type: tool, start: q };
        setDraft({ type: tool, start: q, cur: q });
      }
    }
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!loaded) return;
    const d = dragRef.current;
    const p = toImg(e);
    if (!d) {
      if (tool === "select" && e.pointerType === "mouse") {
        const tol = 6 * px;
        const h = selected ? hitHandle(selected, p, tol + 2 * px) : null;
        const id = h ? selected!.id : (hitTest(marks, p, mt, tol, measure)?.id ?? null);
        if (id !== hoverId) setHoverId(id);
      }
      return;
    }
    if (d.kind === "create") {
      setDraft({ type: d.type, start: d.start, cur: clampPt(p) });
      return;
    }
    if (!d.began) {
      dispatch({ type: "begin" });
      d.began = true;
    }
    const next =
      d.kind === "move"
        ? translateMark(d.orig, p.x - d.start.x, p.y - d.start.y)
        : resizeMark(d.orig, d.handle, clampPt(p));
    dispatch({ type: "live", next: { ...doc, marks: marks.map((m) => (m.id === d.id ? next : m)) } });
  }

  function onPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.kind !== "create" || !draft) {
      setDraft(null);
      return;
    }
    const r = rectFromPoints(draft.start, draft.cur);
    const tiny = Math.max(r.w, r.h) < 5 * px;
    setDraft(null);
    if (tiny) return;
    switch (d.type) {
      case "box":
        setMarks([...marks, { id: newId(), type: "box", ...roundRect(r), color }]);
        break;
      case "redact":
        setMarks([...marks, { id: newId(), type: "redact", ...roundRect(r) }]);
        break;
      case "arrow":
        setMarks([
          ...marks,
          { id: newId(), type: "arrow", x1: draft.start.x, y1: draft.start.y, x2: draft.cur.x, y2: draft.cur.y, color },
        ]);
        break;
      case "crop":
        setPendingCrop(roundRect(r));
        break;
    }
  }

  function onDoubleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (tool !== "select") return;
    const hit = hitTest(marks, toImg(e), mt, 6 * px, measure);
    if (hit?.type === "text") editText(hit);
  }

  /* ── 키보드 ── */
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    const mod = e.metaKey || e.ctrlKey;
    if (typing) {
      if (e.key === "Escape" && t?.closest(".wm-legend")) (t as HTMLInputElement).blur();
      return;
    }
    if (busy) return;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (mod || e.altKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (draft) setDraft(null);
      else if (tool === "crop" && pendingCrop && pendingCrop !== doc.crop) setPendingCrop(doc.crop);
      else if (tool !== "select") chooseTool("select");
      else setSelectedId(null);
      return;
    }
    if (e.key === "Enter") {
      if (tool === "crop" && pendingCrop) {
        e.preventDefault();
        applyCrop(pendingCrop);
        setTool("select");
      } else if (selected?.type === "text") {
        e.preventDefault();
        editText(selected);
      }
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      e.preventDefault();
      deleteSelected();
      return;
    }
    if (selected && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1) * Math.max(1, px);
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      setMarks(marks.map((m) => (m.id === selected.id ? translateMark(m, dx, dy) : m)));
      return;
    }
    // 단축키는 버튼 위에서도 동작하지만, Space/Enter 처럼 버튼을 누르는 키는 건드리지 않는다
    const k = e.key.toUpperCase();
    const hit = ALL_TOOLS.find((x) => x.key === k || x.num === e.key);
    if (hit) {
      e.preventDefault();
      chooseTool(hit.id);
    }
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* ── 범례 ── */
  const numbers = numberMarks(marks);
  const numberOf = new Map(numbers.map((m, i) => [m.id, i + 1]));
  function onLabel(id: string, value: string) {
    if (!labelBegunRef.current) {
      dispatch({ type: "begin" });
      labelBegunRef.current = true;
    }
    dispatch({
      type: "live",
      next: { ...doc, marks: marks.map((m) => (m.id === id && m.type === "number" ? { ...m, label: value } : m)) },
    });
  }

  /* ── 끝내기 ── */
  const dirty = hist.past.length > 0;
  function cancel() {
    if (busy) return;
    if (dirty && !window.confirm("표시한 내용을 버리고 닫을까요?")) return;
    onCancel();
  }

  async function done() {
    if (!loaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const d = tool === "crop" && pendingCrop ? { ...doc, crop: roundRect(pendingCrop) } : doc;
      await document.fonts?.ready;
      const r = await exportAnnotation(loaded.img, d, { width: W, height: H, metrics: mt, fontFamily: family });
      const remote = !file && !/^(blob|data):/i.test(src);
      const sidecar: AnnotationSidecar = {
        v: 1,
        base: r.baseUnchanged && remote ? src : "",
        w: r.width,
        h: r.height,
        marks: r.marks.map(roundMark),
        legend: r.legend,
      };
      await onDone({
        blob: r.blob,
        baseBlob: r.baseBlob,
        caption: legendToCaption(r.legend),
        sidecar,
        width: r.width,
        height: r.height,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /tainted|SecurityError|insecure/i.test(msg)
          ? "다른 사이트의 그림이라 내보낼 수 없어요. 먼저 올린 뒤 표시를 달아 주세요"
          : msg
      );
    } finally {
      setBusy(false);
    }
  }

  /* ── 그리기 ── */
  const sel = tool === "select" ? selected : null;
  const showCropDim = tool === "crop" && (draft?.type === "crop" || pendingCrop);
  const cropRect =
    draft?.type === "crop" ? rectFromPoints(draft.start, draft.cur) : tool === "crop" ? pendingCrop : null;
  const remoteOriginal = !file && !initial && !/^(blob|data):/i.test(src);

  const ui = (
    <div
      ref={rootRef}
      className="wiki-media wm-ann"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${filterId}-title`}
      tabIndex={-1}
    >
      <div className="wm-ann-top">
        <h2 className="wm-crumb" id={`${filterId}-title`}>
          그림에 표시 달기{name ? ` · ${name}` : ""}
        </h2>
        <button type="button" className="wm-btn" onClick={cancel} disabled={busy}>
          취소
        </button>
        <button type="button" className="wm-btn wm-pri" onClick={done} disabled={!loaded || busy}>
          {busy ? "만드는 중…" : doneLabel}
        </button>
      </div>

      <div className="wm-atool" role="toolbar" aria-label="표시 도구">
        {TOOLS.map((t) => (
          <ToolButton
            key={t.id}
            active={tool === t.id}
            onClick={() => chooseTool(t.id)}
            label={t.label}
            shortcut={`${t.key} 또는 ${t.num}`}
            icon={t.icon}
            autoFocus={tool === t.id}
          />
        ))}
        <span className="wm-sep" aria-hidden />
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className="wm-tool wm-swatch"
            aria-pressed={color === c}
            aria-label={`색: ${MARK_COLORS[c].label}`}
            title={MARK_COLORS[c].label}
            onClick={() => {
              setColor(c);
              if (selected && selected.type !== "redact") {
                setMarks(marks.map((m) => (m.id === selected.id && m.type !== "redact" ? { ...m, color: c } : m)));
              }
            }}
          >
            <i style={{ background: MARK_COLORS[c].fill }} />
          </button>
        ))}
        <span className="wm-sep" aria-hidden />
        <button type="button" className="wm-tool" onClick={undo} disabled={!hist.past.length} title="되돌리기 (⌘Z)" aria-label="되돌리기" aria-keyshortcuts="Meta+Z Control+Z">
          <IconUndo />
        </button>
        <button type="button" className="wm-tool" onClick={redo} disabled={!hist.future.length} title="다시 하기 (⇧⌘Z)" aria-label="다시 하기" aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z">
          <IconRedo />
        </button>
        <button type="button" className="wm-tool" onClick={deleteSelected} disabled={!selected} title="지우기 (Delete)" aria-label="고른 표시 지우기" aria-keyshortcuts="Delete Backspace">
          <IconTrash />
        </button>
        <span className="wm-sep" aria-hidden />
        <ToolButton
          active={tool === "crop"}
          onClick={() => chooseTool("crop")}
          label={CROP_TOOL.label}
          shortcut={`${CROP_TOOL.key} 또는 ${CROP_TOOL.num}`}
          icon={CROP_TOOL.icon}
          autoFocus={tool === "crop"}
        />
        {tool === "crop" && (
          <>
            <button
              type="button"
              className="wm-btn wm-sm wm-pri"
              disabled={!pendingCrop}
              onClick={() => {
                applyCrop(pendingCrop);
                setTool("select");
              }}
              title="자르기 적용 (Enter)"
            >
              적용
            </button>
            {(doc.crop || pendingCrop) && (
              <button
                type="button"
                className="wm-btn wm-sm"
                onClick={() => {
                  setPendingCrop(null);
                  if (doc.crop) commit({ ...doc, crop: null });
                }}
              >
                자르기 풀기
              </button>
            )}
          </>
        )}
      </div>

      <div className="wm-work" ref={workRef}>
        {loadError ? (
          <p className="wm-ann-msg wm-err" role="alert">
            {loadError}
          </p>
        ) : !loaded ? (
          <p className="wm-ann-msg">그림을 여는 중…</p>
        ) : (
          <div
            className="wm-col"
            style={{
              width: narrow ? "100%" : Math.max(stageW, Math.min(avail.w, 520)),
              // 세로 가운데를 직접 계산 — 범례 줄 수가 바뀌어도 그림이 위아래로 튀지 않게
              marginTop: narrow ? 0 : Math.max(0, (avail.h - stageH - LEGEND_RESERVE) / 2),
            }}
          >
            <div
              className="wm-stage"
              ref={stageRef}
              data-tool={tool}
              style={{ width: stageW, height: stageH, alignSelf: "center" }}
            >
              <canvas
                ref={canvasRef}
                aria-hidden
                style={{
                  width: W / px,
                  height: H / px,
                  left: -view.x / px,
                  top: -view.y / px,
                }}
              />
              <svg
                viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
                role="img"
                aria-label={`표시 ${marks.length}개가 있는 그림`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={() => hoverId && setHoverId(null)}
                onDoubleClick={onDoubleClick}
                style={{ cursor: tool === "select" && hoverId ? "move" : undefined }}
              >
                <defs>
                  <filter id={`${filterId}-sh`} x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy={mt.stroke * 0.5} stdDeviation={mt.stroke * 0.75} floodColor="#000" floodOpacity="0.28" />
                  </filter>
                </defs>
                <rect x={0} y={0} width={W} height={H} fill="transparent" />
                {marks.map((m) => (
                  <MarkShape
                    key={m.id}
                    m={m}
                    n={numberOf.get(m.id) ?? 0}
                    mt={mt}
                    family={family}
                    measure={measure}
                    shadow={`url(#${filterId}-sh)`}
                    hidden={textEdit?.id === m.id}
                  />
                ))}
                {draft && draft.type !== "crop" && (
                  <DraftShape draft={draft} color={color} mt={mt} px={px} />
                )}
                {showCropDim && cropRect && (
                  <g pointerEvents="none">
                    <path
                      d={`M0 0H${W}V${H}H0Z M${cropRect.x} ${cropRect.y}v${cropRect.h}h${cropRect.w}v${-cropRect.h}Z`}
                      fill="rgba(9,30,66,0.5)"
                      fillRule="evenodd"
                    />
                    <rect
                      x={cropRect.x}
                      y={cropRect.y}
                      width={cropRect.w}
                      height={cropRect.h}
                      fill="none"
                      stroke="#fff"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                )}
                {sel && !textEdit && <Selection m={sel} mt={mt} px={px} measure={measure} />}
              </svg>
              {textEdit && (
                <input
                  className="wm-text-edit"
                  autoFocus
                  aria-label="표시 글"
                  placeholder="글 입력 후 Enter"
                  value={textEdit.value}
                  style={{
                    left: (textEdit.x - view.x) / px,
                    top: (textEdit.y - view.y) / px,
                    fontSize: Math.max(13, mt.textFont / px),
                    fontFamily: family,
                  }}
                  onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      commitText();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setTextEdit(null);
                    }
                  }}
                  onBlur={commitText}
                />
              )}
            </div>

            <div className="wm-legend">
              {numbers.length === 0 && (
                <span className="wm-leg" style={{ color: "var(--wm-fg-3)" }}>
                  ① 번호를 찍으면 여기에 설명 칸이 생겨요
                </span>
              )}
              {numbers.map((m, i) => (
                <label key={m.id} className="wm-leg">
                  <b
                    className="wm-leg-n"
                    style={{ background: MARK_COLORS[m.color].fill, color: MARK_COLORS[m.color].on }}
                    aria-hidden
                  >
                    {i + 1}
                  </b>
                  <input
                    value={m.label}
                    placeholder="설명"
                    title={`${circled(i + 1)} 설명`}
                    aria-label={`${i + 1}번 설명`}
                    onChange={(e) => onLabel(m.id, e.target.value)}
                    onBlur={() => {
                      labelBegunRef.current = false;
                    }}
                  />
                </label>
              ))}
              <span className="wm-leg-hint">
                {remoteOriginal
                  ? "번호 설명은 그림 아래 캡션으로 들어가요 · 가린 곳은 새로 넣는 그림에서 지워져요"
                  : "번호 설명은 그림 아래 캡션으로 들어가요 · 가린 곳은 원본에서도 지워져요"}
              </span>
            </div>
            {error && (
              <p className="wm-note wm-err" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (!isClient) return null;
  return createPortal(ui, document.body);
}

/* ───────────────────────── 조각들 ───────────────────────── */

function ToolButton({
  active,
  onClick,
  label,
  shortcut,
  icon,
  autoFocus,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  shortcut: string;
  icon: ReactNode;
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      className="wm-tool"
      aria-pressed={active}
      aria-label={label}
      title={`${label} (${shortcut})`}
      onClick={onClick}
      data-autofocus={autoFocus ? "" : undefined}
    >
      {icon}
      <span className="wm-tl">{label}</span>
    </button>
  );
}

function MarkShape({
  m,
  n,
  mt,
  family,
  measure,
  shadow,
  hidden,
}: {
  m: Mark;
  n: number;
  mt: MarkMetrics;
  family: string;
  measure: (t: string, s: number) => number;
  shadow: string;
  hidden?: boolean;
}) {
  if (hidden) return null;
  switch (m.type) {
    case "box":
      return (
        <rect
          x={m.x}
          y={m.y}
          width={m.w}
          height={m.h}
          rx={Math.min(mt.boxRadius, m.w / 2, m.h / 2)}
          fill="none"
          stroke={MARK_COLORS[m.color].fill}
          strokeWidth={mt.stroke}
        />
      );
    case "redact":
      return (
        <rect
          x={m.x}
          y={m.y}
          width={m.w}
          height={m.h}
          fill="none"
          stroke="#626f86"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
        />
      );
    case "arrow": {
      const g = arrowGeometry(m, mt);
      const c = MARK_COLORS[m.color].fill;
      return (
        <g>
          <line x1={m.x1} y1={m.y1} x2={g.lineEnd.x} y2={g.lineEnd.y} stroke={c} strokeWidth={mt.stroke} strokeLinecap="round" />
          <polygon points={g.head.map((p) => `${p.x},${p.y}`).join(" ")} fill={c} stroke={c} strokeWidth={1} strokeLinejoin="round" />
        </g>
      );
    }
    case "number": {
      const c = MARK_COLORS[m.color];
      return (
        <g>
          <circle cx={m.x} cy={m.y} r={mt.radius} fill={c.fill} filter={shadow} />
          <text
            x={m.x}
            y={m.y + mt.numberFont * 0.04}
            fill={c.on}
            fontSize={mt.numberFont}
            fontWeight={NUMBER_WEIGHT}
            fontFamily={family}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {n}
          </text>
        </g>
      );
    }
    case "text": {
      const c = MARK_COLORS[m.color];
      const b = textBox(m, mt, measure);
      return (
        <g>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={mt.textPad * 1.2} fill={c.fill} filter={shadow} />
          <text
            x={b.x + mt.textPad}
            y={m.y + mt.textFont * 0.04}
            fill={c.on}
            fontSize={mt.textFont}
            fontWeight={TEXT_WEIGHT}
            fontFamily={family}
            dominantBaseline="central"
          >
            {m.text}
          </text>
        </g>
      );
    }
  }
}

function DraftShape({ draft, color, mt, px }: { draft: Draft; color: MarkColor; mt: MarkMetrics; px: number }) {
  const r = rectFromPoints(draft.start, draft.cur);
  if (draft.type === "arrow") {
    return (
      <MarkShape
        m={{ id: "draft", type: "arrow", x1: draft.start.x, y1: draft.start.y, x2: draft.cur.x, y2: draft.cur.y, color }}
        n={0}
        mt={mt}
        family=""
        measure={() => 0}
        shadow=""
      />
    );
  }
  if (draft.type === "box") {
    return <MarkShape m={{ id: "draft", type: "box", ...r, color }} n={0} mt={mt} family="" measure={() => 0} shadow="" />;
  }
  return (
    <rect
      x={r.x}
      y={r.y}
      width={r.w}
      height={r.h}
      fill="rgba(98,111,134,0.25)"
      stroke="#626f86"
      strokeWidth={1.5 * px}
      strokeDasharray={`${5 * px} ${4 * px}`}
    />
  );
}

function Selection({
  m,
  mt,
  px,
  measure,
}: {
  m: Mark;
  mt: MarkMetrics;
  px: number;
  measure: (t: string, s: number) => number;
}) {
  const pad = (m.type === "box" ? mt.stroke / 2 : 0) + 4 * px;
  const b = markBounds(m, mt, measure);
  return (
    <g pointerEvents="none">
      {m.type !== "arrow" && (
        <rect
          x={b.x - pad}
          y={b.y - pad}
          width={b.w + pad * 2}
          height={b.h + pad * 2}
          fill="none"
          stroke="#0c66e4"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {handlesFor(m).map((h) => (
        <circle
          key={h.id}
          className="wm-handle"
          cx={h.x}
          cy={h.y}
          r={6 * px}
          fill="#fff"
          stroke="#0c66e4"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}
