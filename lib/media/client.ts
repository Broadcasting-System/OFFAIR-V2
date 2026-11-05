/**
 * 미디어 저장소 접근.
 *
 * 지금은 개발용 어댑터(`/dev/media/api`, `npm run dev` 에서만 열림)가
 * `public/uploads/dev/<space>/` 에 쓰고 목록을 읽는다.
 *
 * TODO(wiki-backend): 백엔드 업로드 API(app/api/…)가 들어오면 `defaultMediaClient` 를
 *   그쪽을 부르는 구현으로 바꾼다. 컴포넌트는 MediaClient 인터페이스만 보므로
 *   `uploadFile` / `listFiles` 두 함수만 맞추면 된다. 이름 규칙도 지켜 줄 것:
 *     - 표시 달기 결과 `이름.webp` 옆에 `이름.base.webp`(가린 base)와 `이름.marks.json`(사이드카)
 *     - 목록에서는 .base.* / .marks.json 을 숨기고, 본 그림에 `sidecarUrl` 로 붙여 준다
 *     - 이 두 보조 파일은 같은 이름이면 덮어쓴다 (본 그림 이름은 겹치면 -1, -2 …)
 */

import { baseNameFor, sidecarNameFor } from "./files";
import { replaceExt } from "./image";
import { parseSidecar, serializeSidecar } from "./annotate/sidecar";
import type { AnnotationSidecar } from "./annotate/types";
import type { FileInfo, ListOptions, MediaClient, MediaItem, UploadOptions, UploadResult } from "./types";

export type { MediaClient, FileInfo, UploadResult, UploadOptions, ListOptions } from "./types";

export const DEV_MEDIA_ENDPOINT = "/dev/media/api";

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
      const body = xhr.response as { error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(1);
        resolve(body);
      } else reject(new Error(body?.error ?? `올리지 못했어요 (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("네트워크 오류로 올리지 못했어요"));
    xhr.onabort = () => reject(new DOMException("취소됨", "AbortError"));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** 개발용 어댑터 — 프로덕션에서는 서버가 404 를 돌려준다. */
export function createDevMediaClient(endpoint = DEV_MEDIA_ENDPOINT): MediaClient {
  return {
    async uploadFile(space, file, opts = {}) {
      const form = new FormData();
      form.set("space", space);
      if (opts.doc) form.set("doc", opts.doc);
      if (opts.width) form.set("width", String(opts.width));
      if (opts.height) form.set("height", String(opts.height));
      form.set("file", file, file.name);
      return (await postForm(endpoint, form, opts)) as UploadResult;
    },
    async listFiles(space, opts: ListOptions = {}) {
      const qs = new URLSearchParams({ space });
      if (opts.doc) qs.set("doc", opts.doc);
      if (opts.q) qs.set("q", opts.q);
      const res = await fetch(`${endpoint}?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`목록을 못 불러왔어요 (${res.status})`);
      return ((await res.json()) as { files: FileInfo[] }).files;
    },
  };
}

export const defaultMediaClient: MediaClient = createDevMediaClient();

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
      { doc: opts.doc, width: result.width, height: result.height, onProgress: prog, signal: opts.signal }
    );
    base = up.url;
    done++;
  }

  const sidecar: AnnotationSidecar = { ...result.sidecar, base };
  const scUp = await client.uploadFile(
    space,
    new File([serializeSidecar(sidecar)], sidecarNameFor(finalUp.name), { type: "application/json" }),
    { doc: opts.doc, onProgress: prog, signal: opts.signal }
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
