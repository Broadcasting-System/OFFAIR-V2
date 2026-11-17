/**
 * 미디어(그림·파일·영상) 넣기에 쓰는 공용 타입.
 * 편집기·백엔드와 맞물리는 계약이므로 필드를 바꿀 때는 양쪽에 알린다.
 */

import type { AnnotationSidecar } from "./annotate/types";

export type MediaKind = "image" | "file" | "youtube";

/** 넣기 창이 편집기에 돌려주는 한 항목. */
export interface MediaItem {
  kind: MediaKind;
  /** 그림·파일은 올린 주소, 영상은 https://www.youtube.com/watch?v=… 정규 주소 */
  url: string;
  name: string;
  size?: number;
  width?: number;
  height?: number;
  /** 대체 글 (없으면 편집기가 caption 이나 name 을 쓴다) */
  alt?: string;
  /** 그림 아래 캡션 — 표시 달기의 번호 설명 "① 그룹 탭  ② 편집 패널" */
  caption?: string;
  /** 표시 달기로 만든 그림이면 다시 고치기용 사이드카 */
  sidecar?: AnnotationSidecar;
  /** 사이드카를 따로 올린 주소 (같은 이름.marks.json) */
  sidecarUrl?: string;
  /** youtube 일 때 영상 ID (편집기가 embed 주소를 만들 때) */
  videoId?: string;
  /** youtube 시작 위치(초) */
  start?: number;
}

/** 올린 파일 목록의 한 항목. */
export interface FileInfo {
  url: string;
  name: string;
  size: number;
  kind: "image" | "file";
  /** MIME (모르면 생략) */
  type?: string;
  width?: number;
  height?: number;
  /** 처음 올린 문서 경로 (이 문서 / 공간 전체 구분용) */
  doc?: string;
  /** ISO 시각 */
  uploadedAt?: string;
  /** 표시 달기 사이드카가 있으면 그 주소 */
  sidecarUrl?: string;
}

export interface UploadResult {
  url: string;
  name: string;
  size: number;
  width?: number;
  height?: number;
}

export interface UploadOptions {
  /** 0~1 */
  onProgress?: (fraction: number) => void;
  /** 이 파일을 올린 문서 (목록의 "이 문서" 범위) */
  doc?: string;
  signal?: AbortSignal;
  /** 브라우저가 이미 아는 그림 크기 (서버가 다시 읽지 않도록) */
  width?: number;
  height?: number;
  /** 표시 달기 보조 파일(이름.base.webp·이름.marks.json)이면 본 그림 주소 — 서버가 그 옆에 이름을 맞춰 둔다 */
  of?: string;
}

export interface ListOptions {
  /** 주면 그 문서에서 올린 것만 */
  doc?: string;
  /** 파일 이름 검색어 */
  q?: string;
}

/** 넣기 창이 쓰는 저장소 인터페이스. 백엔드가 생기면 이 모양으로 갈아 끼운다. */
export interface MediaClient {
  uploadFile(space: string, file: File, opts?: UploadOptions): Promise<UploadResult>;
  listFiles(space: string, opts?: ListOptions): Promise<FileInfo[]>;
}
