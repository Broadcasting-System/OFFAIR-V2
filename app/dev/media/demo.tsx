"use client";

/* 개발 전용 데모 — 넣기 창 / 표시 달기를 열어 보고 돌려받은 값을 보여 준다. */

import { useEffect, useState } from "react";
import { ImageAnnotator, MediaInsertDialog, type AnnotatorResult, type MediaTab } from "@/components/media";
import { defaultMediaClient, uploadAnnotated } from "@/lib/media/client";
import { formatBytes } from "@/lib/media/image";
import type { MediaItem } from "@/lib/media/types";

const SPACE = "guide";
const DOC = "onair/time";
const SAMPLE = "/assets/onair/12-time-editor.webp";

type Theme = "system" | "light" | "dark";

export function MediaDemo({ open, tab, theme: theme0 }: { open?: string; tab?: string; theme?: string }) {
  const [dialog, setDialog] = useState<MediaTab | null>(
    open === "dialog" ? ((tab as MediaTab) ?? "upload") : null
  );
  const [annot, setAnnot] = useState<{ src: string; initial?: AnnotatorResult["sidecar"]; name: string } | null>(
    open === "annotator" ? { src: SAMPLE, name: "시보-편집창.webp" } : null
  );
  const [theme, setTheme] = useState<Theme>(theme0 === "dark" || theme0 === "light" ? theme0 : "system");
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [exported, setExported] = useState<{ url: string; caption: string; size: number; item?: MediaItem } | null>(
    null
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  async function onAnnotated(r: AnnotatorResult) {
    const local = URL.createObjectURL(r.blob);
    // 실제 흐름처럼 개발 어댑터로 올려서 사이드카 base 를 채운다
    const item = await uploadAnnotated(defaultMediaClient, SPACE, r, { name: annot?.name ?? "annotated.webp", doc: DOC });
    setExported({ url: local, caption: r.caption, size: r.blob.size, item });
    setAnnot(null);
  }

  const lastSidecar = exported?.item?.sidecar ?? items?.find((i) => i.sidecar)?.sidecar;

  return (
    <div className="wiki-media" data-demo style={{ background: "var(--wm-bg)", minHeight: "calc(100dvh - 4rem)" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "32px 16px", display: "grid", gap: 16 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>미디어 컴포넌트 데모 (개발 전용)</h1>
        <p style={{ margin: 0, color: "var(--wm-fg-2)" }}>
          공간 <code>{SPACE}</code> · 문서 <code>{DOC}</code> · 올린 파일은 <code>public/uploads/dev/{SPACE}/</code>
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="wm-btn wm-pri" data-open="dialog" onClick={() => setDialog("upload")}>
            넣기 창 열기
          </button>
          <button className="wm-btn" data-open="library" onClick={() => setDialog("library")}>
            올린 파일에서
          </button>
          <button className="wm-btn" data-open="url" onClick={() => setDialog("url")}>
            주소로
          </button>
          <button
            className="wm-btn"
            data-open="annotator"
            onClick={() => setAnnot({ src: SAMPLE, name: "시보-편집창.webp" })}
          >
            표시 달기 (예시 그림)
          </button>
          <button
            className="wm-btn"
            data-open="reedit"
            disabled={!lastSidecar?.base}
            onClick={() => lastSidecar && setAnnot({ src: lastSidecar.base, initial: lastSidecar, name: "다시 고치기" })}
          >
            다시 고치기
          </button>
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
            {(["system", "light", "dark"] as Theme[]).map((t) => (
              <button key={t} className="wm-btn wm-sm" aria-pressed={theme === t} onClick={() => setTheme(t)} style={theme === t ? { borderColor: "var(--wm-accent)", color: "var(--wm-accent)" } : undefined}>
                {t === "system" ? "기기" : t === "light" ? "라이트" : "다크"}
              </button>
            ))}
          </span>
        </div>

        {exported && (
          <figure data-result="annotated" style={{ margin: 0, display: "grid", gap: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={exported.url}
              alt={exported.caption || "표시 단 그림"}
              style={{ width: "100%", height: "auto", border: "1px solid var(--wm-line)", borderRadius: 8 }}
            />
            <figcaption style={{ textAlign: "center", color: "var(--wm-fg-3)", fontSize: 13.5 }}>
              {exported.caption || "(캡션 없음)"} · {formatBytes(exported.size)}
            </figcaption>
          </figure>
        )}

        {(items || exported?.item) && (
          <pre
            data-result="json"
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 8,
              background: "var(--wm-bg-soft)",
              border: "1px solid var(--wm-line-2)",
              color: "var(--wm-fg)",
              fontSize: 12,
              overflow: "auto",
              maxHeight: 420,
            }}
          >
            {JSON.stringify(exported?.item ? { annotated: exported.item, inserted: items } : { inserted: items }, null, 2)}
          </pre>
        )}
      </div>

      <MediaInsertDialog
        open={dialog !== null}
        initialTab={dialog ?? "upload"}
        space={SPACE}
        doc={DOC}
        onClose={() => setDialog(null)}
        onInsert={(xs) => setItems(xs)}
      />
      {annot && (
        <ImageAnnotator
          key={annot.src + (annot.initial ? "#re" : "")}
          src={annot.src}
          name={annot.name}
          initial={annot.initial}
          onCancel={() => setAnnot(null)}
          onDone={onAnnotated}
        />
      )}
    </div>
  );
}
