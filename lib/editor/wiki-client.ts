/**
 * 편집기가 문서를 읽고·게시하고·파일을 올릴 때 쓰는 얇은 창구.
 *
 * TODO(백엔드 연결): 지금은 개발용 어댑터(app/write/actions.ts — content/ 파일을 직접
 * 읽고 쓰는 서버 액션, NODE_ENV !== 'production' 에서만 동작)를 부른다.
 * feat/wiki-backend 의 HTTP 라우트가 들어오면 아래 `devAdapter` 를 `httpAdapter` 로
 * 바꾸면 된다. 편집기 쪽 코드는 이 인터페이스만 본다.
 *
 *   getDoc(space, path)            → { mdx, rev, meta }
 *   saveDoc(space, path, mdx, rev) → { ok: true, rev } | { ok: false, conflict: true, rev, mdx }
 *   uploadFile(space, file)        → { url }
 *   suggestPath?(space, title)     → "docs/<slug>"   (새 문서용, 선택)
 *
 * - space: 문서 묶음 이름. 지금은 "guide"(= content/) 하나뿐.
 * - path:  묶음 안 경로, 확장자 없이. 예) "docs/onair-time", "contribution"
 * - rev:   게시본 판 번호(개발 어댑터는 파일 내용 sha1). 새 문서는 null.
 */
import { devGetDoc, devSaveDoc, devSuggestPath, devUploadFile } from "@/app/write/actions";

export interface WikiDocMeta {
  title: string;
  description: string;
  category: string;
  order: number | null;
}

export interface WikiDoc {
  mdx: string;
  rev: string | null;
  meta: WikiDocMeta;
}

export type SaveResult =
  | { ok: true; rev: string }
  | { ok: false; conflict: true; rev: string | null; mdx: string }
  | { ok: false; conflict?: false; error: string };

export interface WikiClient {
  getDoc(space: string, path: string): Promise<WikiDoc | null>;
  saveDoc(space: string, path: string, mdx: string, rev: string | null): Promise<SaveResult>;
  uploadFile(space: string, file: File): Promise<{ url: string }>;
  /** 새 문서의 경로 정하기 (제목 → "docs/<slug>", 겹치지 않게). 없으면 편집기가 직접 만든다. */
  suggestPath?(space: string, title: string): Promise<string>;
}

/** 개발용 어댑터 — 서버 액션으로 content/ 와 public/uploads/dev/ 를 직접 만진다 */
export const devAdapter: WikiClient = {
  async getDoc(space, path) {
    return devGetDoc(space, path);
  },
  async saveDoc(space, path, mdx, rev) {
    return devSaveDoc(space, path, mdx, rev);
  },
  async uploadFile(space, file) {
    const form = new FormData();
    form.set("file", file);
    const r = await devUploadFile(space, form);
    if (!r.ok) throw new Error(r.error);
    return { url: r.url };
  },
  async suggestPath(space, title) {
    return devSuggestPath(space, title);
  },
};

// TODO(백엔드 연결): 예시 — 백엔드 라우트 모양이 정해지면 채운다.
// export const httpAdapter: WikiClient = {
//   async getDoc(space, path) {
//     const r = await fetch(`/api/spaces/${space}/docs/${path}`);
//     if (r.status === 404) return null;
//     return r.json();                                   // { mdx, rev, meta }
//   },
//   async saveDoc(space, path, mdx, rev) {
//     const r = await fetch(`/api/spaces/${space}/docs/${path}`, {
//       method: "PUT", headers: { "content-type": "application/json", "if-match": rev ?? "" },
//       body: JSON.stringify({ mdx, rev }),
//     });
//     if (r.status === 409) return { ok: false, conflict: true, ...(await r.json()) };
//     if (!r.ok) return { ok: false, error: await r.text() };
//     return { ok: true, rev: (await r.json()).rev };
//   },
//   async uploadFile(space, file) {
//     const form = new FormData(); form.set("file", file);
//     const r = await fetch(`/api/spaces/${space}/uploads`, { method: "POST", body: form });
//     if (!r.ok) throw new Error(await r.text());
//     return r.json();                                   // { url }
//   },
// };

export const wikiClient: WikiClient = devAdapter;

export { DEFAULT_SPACE } from "./space";
