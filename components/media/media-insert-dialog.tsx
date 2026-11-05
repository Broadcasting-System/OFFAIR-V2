"use client";

/**
 * 넣기 창 — 내 컴퓨터에서 / 올린 파일에서 / 주소로.  시안: f5-upload B.
 *
 *   <MediaInsertDialog open space="guide" doc="onair/time" onClose onInsert={(items) => …} />
 *
 * - 그림은 브라우저에서 긴 변 1920px · WebP 로 줄인다. 넣기를 누를 때 올린다
 *   (그 전에 "표시 달기"로 가리면 가리기 전 원본은 서버에 가지 않는다).
 * - 그림이 아닌 파일은 고르자마자 그대로 올린다 (진행률 표시).
 * - 키보드: Esc 닫기, Enter 넣기, 격자는 화살표로 이동·Space 로 고르기.
 */

import "./media.css";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import type { AnnotationSidecar } from "@/lib/media/annotate/types";
import {
  defaultMediaClient,
  loadSidecar,
  uploadAnnotated,
  type AnnotatorResult,
} from "@/lib/media/client";
import { ACCEPT_ATTR, badgeFor, checkFile, extOf } from "@/lib/media/files";
import { formatBytes, prepareImage, shrinkMessage } from "@/lib/media/image";
import type { FileInfo, MediaClient, MediaItem } from "@/lib/media/types";
import { nameFromUrl, normalizeHttpUrl, parseYouTube, youTubeThumb, youTubeWatchUrl } from "@/lib/media/url";

import { IconPen, IconSearch, IconUpload, IconX } from "./icons";
import { ImageAnnotator } from "./image-annotator";
import { useIsClient, useModal } from "./use-modal";

export type MediaTab = "upload" | "library" | "url";

export interface MediaInsertDialogProps {
  open: boolean;
  onClose: () => void;
  /** 넣을 항목들 (넣기를 누른 차례). 받은 뒤 창은 스스로 닫힌다(onClose 도 불림). */
  onInsert: (items: MediaItem[]) => void;
  /** 공간 (가이드북 등). 올리는 폴더·목록 범위 */
  space: string;
  /** 지금 문서 경로 — 있으면 "이 문서" 범위를 쓸 수 있고, 올린 파일에 기록된다 */
  doc?: string;
  /** 저장소 (기본: 개발용 어댑터) */
  client?: MediaClient;
  initialTab?: MediaTab;
  /** 여러 개 넣기 (기본 true) */
  multiple?: boolean;
}

export function MediaInsertDialog(props: MediaInsertDialogProps) {
  const isClient = useIsClient();
  if (!props.open || !isClient) return null;
  return createPortal(<DialogBody {...props} />, document.body);
}

/* ───────────────────────── 상태 타입 ───────────────────────── */

type QStatus = "preparing" | "ready" | "uploading" | "done" | "error";

interface QItem {
  id: string;
  kind: "image" | "file";
  name: string;
  originalSize: number;
  status: QStatus;
  progress: number;
  error?: string;
  /** 그림: 줄인 파일 */
  prepared?: File;
  previewUrl?: string;
  width?: number;
  height?: number;
  /** 표시 달기 결과 (그림) */
  annotation?: AnnotatorResult;
  result?: MediaItem;
}

type Annotating =
  | { from: "queue"; id: string }
  | { from: "library"; file: FileInfo; sidecar?: AnnotationSidecar };

const TABS: { id: MediaTab; label: string }[] = [
  { id: "upload", label: "내 컴퓨터에서" },
  { id: "library", label: "올린 파일에서" },
  { id: "url", label: "주소로" },
];

let qSeq = 0;
const stemOf = (name: string) => name.replace(/\.[^.]+$/, "");

function DialogBody({
  onClose,
  onInsert,
  space,
  doc,
  client = defaultMediaClient,
  initialTab = "upload",
  multiple = true,
}: MediaInsertDialogProps) {
  const uid = useId().replace(/:/g, "");
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<Set<string>>(new Set());
  const abortsRef = useRef<Map<string, AbortController>>(new Map());
  const pendingRef = useRef<Map<string, Promise<MediaItem | null>>>(new Map());

  const [tab, setTab] = useState<MediaTab>(initialTab);
  const [queue, setQueue] = useState<QItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [annotating, setAnnotating] = useState<Annotating | null>(null);
  const [inserting, setInserting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 올린 파일
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"doc" | "all">(doc ? "doc" : "all");
  const [lib, setLib] = useState<{ key: string; files: FileInfo[]; error?: string } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [focusIdx, setFocusIdx] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  // 주소로
  const [urlInput, setUrlInput] = useState("");
  const [alt, setAlt] = useState("");
  const [probe, setProbe] = useState<{ url: string; ok: boolean; w?: number; h?: number } | null>(null);

  useModal(panelRef, !annotating, '[role="tab"][aria-selected="true"]');

  /* 창을 닫을 때 진행 중인 올리기 멈추고 미리보기 주소 정리 */
  useEffect(() => {
    const urls = urlsRef.current;
    const aborts = abortsRef.current;
    return () => {
      aborts.forEach((a) => a.abort());
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const objectUrl = (b: Blob) => {
    const u = URL.createObjectURL(b);
    urlsRef.current.add(u);
    return u;
  };
  const patch = (id: string, p: Partial<QItem>) =>
    setQueue((qs) => qs.map((it) => (it.id === id ? { ...it, ...p } : it)));

  /* ───────── 내 컴퓨터에서 ───────── */

  function uploadPlainFile(id: string, file: File): Promise<MediaItem | null> {
    const ac = new AbortController();
    abortsRef.current.set(id, ac);
    patch(id, { status: "uploading", progress: 0 });
    const p = client
      .uploadFile(space, file, { doc, signal: ac.signal, onProgress: (f) => patch(id, { progress: f }) })
      .then((r) => {
        const item: MediaItem = { kind: "file", url: r.url, name: r.name, size: r.size };
        patch(id, { status: "done", progress: 1, result: item });
        return item;
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name !== "AbortError") patch(id, { status: "error", error: (e as Error).message });
        return null;
      })
      .finally(() => abortsRef.current.delete(id));
    pendingRef.current.set(id, p);
    return p;
  }

  function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (!files.length) return;
    setTab("upload");
    setError(null);
    const items: QItem[] = files.map((f) => {
      const c = checkFile(f);
      qSeq += 1;
      return {
        id: `q${qSeq}`,
        kind: c.ok ? c.kind : "file",
        name: f.name,
        originalSize: f.size,
        status: c.ok ? "preparing" : "error",
        progress: 0,
        error: c.ok ? undefined : c.reason,
      };
    });
    setQueue((qs) => (multiple ? [...qs, ...items] : items.slice(0, 1)));
    (multiple ? items : items.slice(0, 1)).forEach((it, i) => {
      if (it.status === "error") return;
      const f = files[i];
      if (it.kind === "file") {
        void uploadPlainFile(it.id, f);
        return;
      }
      prepareImage(f)
        .then((p) => {
          if (p.file.size > 25 * 1024 * 1024) throw new Error("줄여도 25MB 가 넘어요");
          patch(it.id, {
            status: "ready",
            prepared: p.file,
            previewUrl: objectUrl(p.file),
            width: p.width || undefined,
            height: p.height || undefined,
          });
        })
        .catch((e: unknown) => patch(it.id, { status: "error", error: (e as Error).message }));
    });
  }

  function removeItem(id: string) {
    abortsRef.current.get(id)?.abort();
    pendingRef.current.delete(id);
    setQueue((qs) => qs.filter((x) => x.id !== id));
  }

  /** 줄 하나를 올려서 MediaItem 으로 (그림은 이때 올린다) */
  async function settle(it: QItem): Promise<MediaItem | null> {
    if (it.status === "done" && it.result) return it.result;
    if (it.kind === "file") return (await pendingRef.current.get(it.id)) ?? null;
    if (it.status !== "ready" || !it.prepared) return null;
    const ac = new AbortController();
    abortsRef.current.set(it.id, ac);
    patch(it.id, { status: "uploading", progress: 0 });
    try {
      let item: MediaItem;
      if (it.annotation) {
        item = await uploadAnnotated(client, space, it.annotation, {
          name: it.name,
          doc,
          signal: ac.signal,
          onProgress: (f) => patch(it.id, { progress: f }),
        });
      } else {
        const r = await client.uploadFile(space, it.prepared, {
          doc,
          width: it.width,
          height: it.height,
          signal: ac.signal,
          onProgress: (f) => patch(it.id, { progress: f }),
        });
        item = { kind: "image", url: r.url, name: r.name, size: r.size, width: it.width, height: it.height, alt: stemOf(r.name) };
      }
      patch(it.id, { status: "done", progress: 1, result: item });
      return item;
    } catch (e) {
      patch(it.id, { status: "error", error: (e as Error).message });
      throw e;
    } finally {
      abortsRef.current.delete(it.id);
    }
  }

  async function insertFromQueue(snapshot: QItem[]) {
    const live = snapshot.filter((x) => x.status !== "error");
    if (!live.length) return;
    setInserting(true);
    setError(null);
    try {
      const out: MediaItem[] = [];
      for (const it of live) {
        const m = await settle(it);
        if (m) out.push(m);
      }
      if (!out.length) throw new Error("넣을 수 있는 파일이 없어요");
      onInsert(out);
      onClose();
    } catch (e) {
      setError((e as Error).message || "올리지 못했어요");
      setInserting(false);
    }
  }

  /* ───────── 올린 파일에서 ───────── */

  const libScope = doc ? scope : "all";
  const libKey = `${space}|${libScope}|${q.trim()}`;
  useEffect(() => {
    if (tab !== "library") return;
    let alive = true;
    const t = window.setTimeout(() => {
      client
        .listFiles(space, { doc: libScope === "doc" ? doc : undefined, q: q.trim() || undefined })
        .then((files) => alive && setLib({ key: libKey, files }))
        .catch((e: unknown) => alive && setLib({ key: libKey, files: [], error: (e as Error).message }));
    }, q ? 180 : 0);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [tab, libKey, client, space, doc, libScope, q]);

  const libLoading = !lib || lib.key !== libKey;
  const files = lib?.files ?? [];
  const pickedFiles = picked
    .map((u) => files.find((f) => f.url === u))
    .filter((f): f is FileInfo => !!f);

  function togglePick(f: FileInfo) {
    setPicked((p) =>
      p.includes(f.url) ? p.filter((u) => u !== f.url) : multiple ? [...p, f.url] : [f.url]
    );
  }

  function fileToItem(f: FileInfo): MediaItem {
    return f.kind === "image"
      ? { kind: "image", url: f.url, name: f.name, size: f.size, width: f.width, height: f.height, alt: stemOf(f.name), sidecarUrl: f.sidecarUrl }
      : { kind: "file", url: f.url, name: f.name, size: f.size };
  }

  function insertPicked(list = pickedFiles) {
    if (!list.length) return;
    onInsert(list.map(fileToItem));
    onClose();
  }

  function onGridKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!files.length) return;
    const grid = gridRef.current;
    const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 1 : 4;
    let next = focusIdx;
    if (e.key === "ArrowRight") next = focusIdx + 1;
    else if (e.key === "ArrowLeft") next = focusIdx - 1;
    else if (e.key === "ArrowDown") next = focusIdx + cols;
    else if (e.key === "ArrowUp") next = focusIdx - cols;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = files.length - 1;
    else if (e.key === " ") {
      e.preventDefault();
      togglePick(files[focusIdx]);
      return;
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (pickedFiles.length) insertPicked();
      else insertPicked([files[focusIdx]]);
      return;
    } else return;
    e.preventDefault();
    next = Math.max(0, Math.min(files.length - 1, next));
    setFocusIdx(next);
    grid?.querySelectorAll<HTMLElement>('[role="option"]')[next]?.focus();
  }

  async function annotateLibrary(f: FileInfo) {
    let sidecar: AnnotationSidecar | undefined;
    if (f.sidecarUrl) {
      try {
        sidecar = await loadSidecar(f.sidecarUrl);
      } catch {
        sidecar = undefined; // 사이드카가 깨졌으면 그냥 그림만 연다
      }
    }
    setAnnotating({ from: "library", file: f, sidecar: sidecar?.base ? sidecar : undefined });
  }

  /* ───────── 주소로 ───────── */

  const yt = parseYouTube(urlInput);
  const imgUrl = yt ? null : normalizeHttpUrl(urlInput);
  useEffect(() => {
    if (!imgUrl) return;
    let alive = true;
    const t = window.setTimeout(() => {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.onload = () => alive && setProbe({ url: imgUrl, ok: true, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => alive && setProbe({ url: imgUrl, ok: false });
      img.src = imgUrl;
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [imgUrl]);
  const urlState: "empty" | "youtube" | "loading" | "image" | "bad" = yt
    ? "youtube"
    : !urlInput.trim()
      ? "empty"
      : !imgUrl
        ? "bad"
        : probe?.url !== imgUrl
          ? "loading"
          : probe.ok
            ? "image"
            : "bad";

  function insertUrl() {
    if (yt) {
      onInsert([
        {
          kind: "youtube",
          url: youTubeWatchUrl(yt),
          name: `YouTube 영상 ${yt.id}`,
          videoId: yt.id,
          start: yt.start,
          alt: alt.trim() || undefined,
        },
      ]);
      onClose();
    } else if (urlState === "image" && imgUrl) {
      onInsert([
        {
          kind: "image",
          url: imgUrl,
          name: nameFromUrl(imgUrl),
          width: probe?.w,
          height: probe?.h,
          alt: alt.trim() || undefined,
        },
      ]);
      onClose();
    }
  }

  /* ───────── 공통: 넣기·키보드·끌어 놓기 ───────── */

  const queueInsertable =
    queue.some((x) => x.status !== "error") && !queue.some((x) => x.status === "preparing");
  const canInsert =
    !inserting &&
    (tab === "upload" ? queueInsertable : tab === "library" ? pickedFiles.length > 0 : urlState === "youtube" || urlState === "image");

  function insert() {
    if (!canInsert) return;
    if (tab === "upload") void insertFromQueue(queue);
    else if (tab === "library") insertPicked();
    else insertUrl();
  }

  function close() {
    if (inserting) return;
    onClose();
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (annotating) return; // 표시 달기가 위에 떠 있으면 그쪽이 키를 받는다
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Enter" && !e.nativeEvent.isComposing && !e.metaKey && !e.altKey) {
      const t = e.target as HTMLElement;
      if (t.tagName === "BUTTON" || t.tagName === "TEXTAREA" || t.tagName === "A") return;
      if (canInsert) {
        e.preventDefault();
        insert();
      }
    }
  }

  function onTabKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex((t) => t.id === tab);
    let j = i;
    if (e.key === "ArrowRight") j = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[j].id);
    document.getElementById(`${uid}-tab-${TABS[j].id}`)?.focus();
  }

  function onDrop(e: ReactDragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  function onPaste(e: ReactClipboardEvent) {
    const fl = e.clipboardData.files;
    if (fl.length && !(e.target as HTMLElement).closest("input")) {
      e.preventDefault();
      addFiles(fl);
    }
  }

  /* ───────── 표시 달기 끝 ───────── */

  async function onAnnotated(r: AnnotatorResult) {
    if (!annotating) return;
    if (annotating.from === "library") {
      const f = annotating.file;
      // 다시 고친 그림이면 이름에서 "-1" 같은 꼬리는 그대로 두고 서버가 겹침을 피한다
      const item = await uploadAnnotated(client, space, r, { name: f.name, doc });
      setAnnotating(null);
      onInsert([item]);
      onClose();
      return;
    }
    const id = annotating.id;
    const next = queue.map((it) =>
      it.id === id
        ? { ...it, annotation: r, previewUrl: objectUrl(r.blob), width: r.width, height: r.height }
        : it
    );
    setQueue(next);
    setAnnotating(null);
    if (next.filter((x) => x.status !== "error").length === 1) await insertFromQueue(next);
  }

  const annotItem = annotating?.from === "queue" ? queue.find((x) => x.id === annotating.id) : undefined;
  const liveCount = queue.filter((x) => x.status !== "error").length;

  /* ───────── 그리기 ───────── */

  const hint =
    tab === "upload"
      ? "그림은 긴 변 1920px · WebP 로 줄여서, 넣기를 누를 때 올려요"
      : tab === "library"
        ? `${libScope === "doc" ? "이 문서" : "공간 전체"}에서 올린 파일 ${libLoading ? "…" : files.length}개${pickedFiles.length ? ` · ${pickedFiles.length}개 고름` : ""}`
        : "유튜브 주소나 그림 주소를 붙여 넣으세요";

  return (
    <div
      className="wiki-media wm-dim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    >
      <div
        ref={panelRef}
        className="wm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes("Files")) {
            e.preventDefault();
            if (!dragOver) setDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={onDrop}
        aria-hidden={annotating ? true : undefined}
      >
        <h2 id={`${uid}-title`} className="wm-sr">
          파일 넣기
        </h2>
        <div className="wm-tabs" role="tablist" aria-label="가져올 곳" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`${uid}-tab-${t.id}`}
              type="button"
              role="tab"
              className="wm-tab"
              aria-selected={tab === t.id}
              aria-controls={`${uid}-panel`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="wm-mb" id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`}>
          {tab === "upload" && (
            <>
              <div className={`wm-drop${dragOver ? " wm-over" : ""}`}>
                <IconUpload />
                <div className="wm-big">
                  {dragOver ? "여기에 놓으면 올라가요" : (
                    <>
                      파일을 끌어 놓거나{" "}
                      <button type="button" className="wm-link" onClick={() => fileInputRef.current?.click()}>
                        파일 고르기
                      </button>
                    </>
                  )}
                </div>
                <small>그림(PNG·JPG·WebP·GIF) · PDF·JSON·ZIP·HWP 등 25MB 까지 · 붙여넣기(⌘V)도 돼요</small>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple={multiple}
                  accept={ACCEPT_ATTR}
                  hidden
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
              {queue.length > 0 && (
                <ul className="wm-queue" aria-label="올릴 파일">
                  {queue.map((it) => (
                    <QueueRow
                      key={it.id}
                      it={it}
                      busy={inserting}
                      onRemove={() => removeItem(it.id)}
                      onAnnotate={() => setAnnotating({ from: "queue", id: it.id })}
                    />
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === "library" && (
            <>
              <div className="wm-filter">
                <label className="wm-search">
                  <IconSearch />
                  <span className="wm-sr">파일 이름으로 찾기</span>
                  <input
                    type="search"
                    placeholder="파일 이름으로 찾기"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setFocusIdx(0);
                    }}
                  />
                </label>
                {doc && (
                  <div className="wm-seg" role="group" aria-label="범위">
                    <button type="button" aria-pressed={scope === "doc"} onClick={() => setScope("doc")}>
                      이 문서
                    </button>
                    <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>
                      공간 전체
                    </button>
                  </div>
                )}
              </div>
              {lib?.error && lib.key === libKey ? (
                <p className="wm-empty" role="alert">
                  {lib.error}
                </p>
              ) : !libLoading && files.length === 0 ? (
                <p className="wm-empty">
                  {q ? `"${q}" 이름의 파일이 없어요` : libScope === "doc" ? "이 문서에서 올린 파일이 아직 없어요" : "올린 파일이 아직 없어요"}
                </p>
              ) : (
                <div
                  ref={gridRef}
                  className="wm-grid"
                  role="listbox"
                  aria-multiselectable={multiple}
                  aria-label="올린 파일"
                  aria-busy={libLoading}
                  onKeyDown={onGridKey}
                >
                  {files.map((f, i) => {
                    const on = picked.includes(f.url);
                    return (
                      <div
                        key={f.url}
                        role="option"
                        aria-selected={on}
                        tabIndex={i === Math.min(focusIdx, files.length - 1) ? 0 : -1}
                        className="wm-th"
                        title={f.name}
                        onClick={() => {
                          setFocusIdx(i);
                          togglePick(f);
                        }}
                        onDoubleClick={() => insertPicked([f])}
                      >
                        <div className="wm-im">
                          {f.kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.url} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <span className={`wm-badge${extOf(f.name) === "pdf" ? " wm-pdf" : ""}`}>{badgeFor(f.name)}</span>
                          )}
                        </div>
                        {f.sidecarUrl && <span className="wm-tag">표시</span>}
                        {on && (
                          <span className="wm-check" aria-hidden>
                            {multiple ? picked.indexOf(f.url) + 1 : "✓"}
                          </span>
                        )}
                        <small>{f.name}</small>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === "url" && (
            <>
              <div className="wm-field">
                <label htmlFor={`${uid}-url`}>주소</label>
                <input
                  id={`${uid}-url`}
                  className="wm-input"
                  type="url"
                  inputMode="url"
                  placeholder="https://youtu.be/… 또는 https://…/그림.png"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="wm-preview" aria-live="polite">
                {urlState === "empty" && <span>붙여 넣으면 여기서 미리 보여요</span>}
                {urlState === "loading" && <span>불러오는 중…</span>}
                {urlState === "bad" && <span className="wm-note wm-err">그림이나 유튜브 주소가 아니에요</span>}
                {urlState === "youtube" && yt && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={youTubeThumb(yt.id)} alt="유튜브 영상 미리보기" referrerPolicy="no-referrer" />
                    <span className="wm-yt-play" aria-hidden>
                      <svg width="20" height="20" viewBox="0 0 20 20">
                        <path d="M6 4l10 6-10 6z" fill="#fff" />
                      </svg>
                    </span>
                  </>
                )}
                {urlState === "image" && imgUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgUrl} alt="그림 미리보기" referrerPolicy="no-referrer" />
                )}
              </div>
              {(urlState === "image" || urlState === "youtube") && (
                <div className="wm-field" style={{ marginTop: 12, marginBottom: 0 }}>
                  <label htmlFor={`${uid}-alt`}>{urlState === "youtube" ? "영상 설명 (선택)" : "대체 글 (선택)"}</label>
                  <input
                    id={`${uid}-alt`}
                    className="wm-input"
                    placeholder={urlState === "youtube" ? "예: 시보 설정 따라 하기" : "그림을 못 볼 때 읽어 줄 설명"}
                    value={alt}
                    onChange={(e) => setAlt(e.target.value)}
                  />
                </div>
              )}
              {urlState === "youtube" && yt && (
                <p className="wm-note">
                  영상 {yt.id}
                  {yt.start ? ` · ${Math.floor(yt.start / 60)}분 ${yt.start % 60}초부터` : ""}
                </p>
              )}
              {urlState === "image" && probe && (
                <p className="wm-note">
                  {probe.w}×{probe.h} · 주소 그대로 넣어요 (우리 서버에 복사하지 않아요)
                </p>
              )}
            </>
          )}
        </div>

        <div className="wm-mf">
          <span className="wm-hint" role={error ? "alert" : undefined} style={error ? { color: "var(--wm-danger)" } : undefined}>
            {error ?? hint}
          </span>
          {tab === "library" && pickedFiles.length === 1 && pickedFiles[0].kind === "image" && (
            <button type="button" className="wm-btn" onClick={() => void annotateLibrary(pickedFiles[0])}>
              <IconPen />
              표시 달기
            </button>
          )}
          <button type="button" className="wm-btn" onClick={close} disabled={inserting}>
            취소
          </button>
          <button type="button" className="wm-btn wm-pri" onClick={insert} disabled={!canInsert}>
            {inserting ? "올리는 중…" : "넣기"}
          </button>
        </div>
      </div>

      {annotating?.from === "queue" && annotItem?.prepared && (
        <ImageAnnotator
          key={annotItem.id}
          src=""
          file={annotItem.annotation?.baseBlob ?? annotItem.prepared}
          initial={annotItem.annotation?.sidecar}
          name={annotItem.name}
          doneLabel={liveCount === 1 ? "본문에 넣기" : "표시 저장"}
          onCancel={() => setAnnotating(null)}
          onDone={onAnnotated}
        />
      )}
      {annotating?.from === "library" && (
        <ImageAnnotator
          key={annotating.file.url}
          src={annotating.sidecar?.base ?? annotating.file.url}
          initial={annotating.sidecar}
          name={annotating.file.name}
          onCancel={() => setAnnotating(null)}
          onDone={onAnnotated}
        />
      )}
    </div>
  );
}

function QueueRow({
  it,
  busy,
  onRemove,
  onAnnotate,
}: {
  it: QItem;
  busy: boolean;
  onRemove: () => void;
  onAnnotate: () => void;
}) {
  const finalSize = it.annotation?.blob.size ?? it.prepared?.size;
  let sub: string;
  let cls = "";
  switch (it.status) {
    case "preparing":
      sub = it.kind === "image" ? `${formatBytes(it.originalSize)} · 줄이는 중…` : formatBytes(it.originalSize);
      break;
    case "ready":
      sub =
        (finalSize != null && shrinkMessage(it.originalSize, finalSize)) ||
        `${formatBytes(finalSize ?? it.originalSize)} · 넣기를 누르면 올라가요`;
      if (it.annotation) sub += " · 표시 달림";
      break;
    case "uploading":
      sub = `올리는 중… ${Math.round(it.progress * 100)}%`;
      break;
    case "done":
      sub = `올렸어요 · ${formatBytes(it.result?.size ?? finalSize ?? it.originalSize)}`;
      cls = "wm-done";
      break;
    default:
      sub = it.error ?? "올리지 못했어요";
      cls = "wm-err";
  }
  return (
    <li className="wm-row">
      <span className="wm-thumb">
        {it.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.previewUrl} alt="" />
        ) : (
          <span className={`wm-badge${extOf(it.name) === "pdf" ? " wm-pdf" : ""}`}>{badgeFor(it.name)}</span>
        )}
      </span>
      <span className="wm-meta">
        <b>{it.name}</b>
        <small className={cls}>{sub}</small>
        {(it.status === "uploading" || (it.status === "done" && it.kind === "file")) && (
          <span
            className="wm-bar"
            role="progressbar"
            aria-label={`${it.name} 올리기`}
            aria-valuenow={Math.round(it.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${Math.round(it.progress * 100)}%` }} />
          </span>
        )}
      </span>
      <span className="wm-acts">
        {it.kind === "image" && it.status === "ready" && (
          <button type="button" className="wm-btn wm-sm" onClick={onAnnotate} disabled={busy}>
            <IconPen />
            표시 달기
          </button>
        )}
        <button
          type="button"
          className="wm-btn wm-sm wm-ghost"
          onClick={onRemove}
          disabled={busy}
          aria-label={`${it.name} 빼기`}
          title="빼기"
        >
          <IconX />
        </button>
      </span>
    </li>
  );
}
