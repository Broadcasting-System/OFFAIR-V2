/**
 * 미디어 저장소 접근 — 위키 업로드 API.
 *
 *   POST /api/wiki/<space>/uploads   multipart: file, doc?, width?, height?, of?
 *   GET  /api/wiki/<space>/uploads?doc=&q=   → { files: FileInfo[] }
 *
 * 표시 달기 보조 파일은 `of`(본 그림 주소)와 함께 올리면 서버가 본 그림 이름에 맞춰
 * `이름.base.webp`(가린 바탕)·`이름.marks.json`(사이드카)으로 같은 폴더에 둔다(같은 이름이면 덮어씀).
 * 목록은 이 둘을 숨기고 본 그림에 `sidecarUrl` 을 붙여 준다 (lib/store/uploads.ts).
 */

import { baseNameFor, sidecarNameFor } from "./files";
import { replaceExt } from "./image";
import { parseSidecar, serializeSidecar } from "./annotate/sidecar";
import type { AnnotationSidecar } from "./annotate/types";
import type { FileInfo, ListOptions, MediaClient, MediaItem, UploadOptions, UploadResult } from "./types";

export type { MediaClient, FileInfo, UploadResult, UploadOptions, ListOptions } from "./types";


/** XMLHttpRequest 로 올린다 — fetch 는 올리는 진행률을 못 준다. */
function postForm(url: string, form: FormData, opts: UploadOptions = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      const body = xhr.response as { error?: string; message?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(1);
        resolve(body);
      } else if (xhr.status === 401) reject(new Error("로그인이 풀렸어요. 다시 로그인해 주세요"));
      else reject(new Error(body?.message ?? body?.error ?? `올리지 못했어요 (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("네트워크 오류로 올리지 못했어요"));
    xhr.onabort = () => reject(new DOMException("취소됨", "AbortError"));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** 위키 업로드 API 어댑터 */
export function createHttpMediaClient(base = "/api/wiki"): MediaClient {
  const endpoint = (space: string) => `${base}/${encodeURIComponent(space)}/uploads`;
  return {
    async uploadFile(space, file, opts = {}) {
      const form = new FormData();
      if (opts.doc) form.set("doc", opts.doc);
      if (opts.of) form.set("of", opts.of);
      if (opts.width) form.set("width", String(Math.round(opts.width)));
      if (opts.height) form.set("height", String(Math.round(opts.height)));
      form.set("file", file, file.name);
      return (await postForm(endpoint(space), form, opts)) as UploadResult;
    },
    async listFiles(space, opts: ListOptions = {}) {
      const qs = new URLSearchParams();
      if (opts.doc) qs.set("doc", opts.doc);
      if (opts.q) qs.set("q", opts.q);
      const res = await fetch(`${endpoint(space)}?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 401 ? "로그인해야 볼 수 있어요" : `목록을 못 불러왔어요 (${res.status})`);
      return ((await res.json()) as { files: FileInfo[] }).files;
    },
  };
}

export const defaultMediaClient: MediaClient = createHttpMediaClient();

/** 편하게 부르는 함수형 (스펙의 uploadFile / listFiles) */
export function uploadFile(space: string, file: File, opts?: UploadOptions): Promise<UploadResult> {
  return defaultMediaClient.uploadFile(space, file, opts);
}

export function listFiles(space: string, opts?: ListOptions): Promise<FileInfo[]> {
  return defaultMediaClient.listFiles(space, opts);
}

export async function loadSidecar(url: string): Promise<AnnotationSidecar> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`표시 정보를 못 불러왔어요 (${res.status})`);
  return parseSidecar(await res.text());
}

/** 표시 달기 결과 (ImageAnnotator onDone 이 주는 값) */
export interface AnnotatorResult {
  /** 표시까지 구운 최종 그림 */
  blob: Blob;
  /** 가리기·자르기만 적용된 그림 — sidecar.base 가 비어 있으면 이걸 올려야 한다 */
  baseBlob: Blob;
  /** "① 그룹 탭  ② 편집 패널" */
  caption: string;
  /** base 가 이미 올라간 주소면 채워져 있고, 새로 올려야 하면 "" */
  sidecar: AnnotationSidecar;
  width: number;
  height: number;
}

/**
 * 표시 달기 결과를 올리고 넣을 항목을 만든다.
 * 순서: 최종 그림 → (필요하면) base → 사이드카. 가리기 전 원본은 올리지 않는다.
 */
export async function uploadAnnotated(
  client: MediaClient,
  space: string,
  result: AnnotatorResult,
  opts: { name: string; doc?: string; onProgress?: (f: number) => void; signal?: AbortSignal }
): Promise<MediaItem> {
  const ext = result.blob.type === "image/webp" ? "webp" : "png";
  const needBase = !result.sidecar.base;
  const steps = needBase ? 3 : 2;
  let done = 0;
  const prog = (f: number) => opts.onProgress?.((done + f) / steps);

  const finalUp = await client.uploadFile(
    space,
    new File([result.blob], replaceExt(opts.name, ext), { type: result.blob.type }),
    { doc: opts.doc, width: result.width, height: result.height, onProgress: prog, signal: opts.signal }
  );
  done++;

  let base = result.sidecar.base;
  if (needBase) {
    const bext = result.baseBlob.type === "image/webp" ? "webp" : "png";
    const up = await client.uploadFile(
      space,
      new File([result.baseBlob], baseNameFor(replaceExt(finalUp.name, bext)), { type: result.baseBlob.type }),
      { doc: opts.doc, of: finalUp.url, width: result.width, height: result.height, onProgress: prog, signal: opts.signal }
    );
    base = up.url;
    done++;
  }

  const sidecar: AnnotationSidecar = { ...result.sidecar, base };
  const scUp = await client.uploadFile(
    space,
    new File([serializeSidecar(sidecar)], sidecarNameFor(finalUp.name), { type: "application/json" }),
    { doc: opts.doc, of: finalUp.url, onProgress: prog, signal: opts.signal }
  );
  opts.onProgress?.(1);

  return {
    kind: "image",
    url: finalUp.url,
    name: finalUp.name,
    size: finalUp.size,
    width: result.width,
    height: result.height,
    caption: result.caption || undefined,
    alt: result.caption || undefined,
    sidecar,
    sidecarUrl: scUp.url,
  };
}
