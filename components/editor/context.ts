"use client";

import { createContext, useContext } from "react";

/** 표시 달기(ImageAnnotator) 결과로 그림 블록에 넣을 값 */
export interface AnnotatedFigure {
  src: string;
  sidecar: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
}

/** 노드 뷰(상자·그림 등)가 편집기 바깥 기능을 쓸 때 — 파일 올리기, 넣기 창, 표시 달기, 알림 */
export interface EditorUi {
  uploadImage(file: File): Promise<{ url: string; width: number | null; height: number | null } | null>;
  toast(message: string): void;
  /** 그림 바꾸기 — 넣기 창(MediaInsertDialog)을 열고 고른 그림을 돌려준다 */
  pickImage?(): Promise<{ src: string; alt: string; caption: string | null; sidecar: string | null; width: number | null; height: number | null } | null>;
  /** 표시 달기 / 다시 고치기 — sidecar 가 있으면 그 표시를 불러와 이어서 고친다 */
  annotate?(input: { src: string; sidecar: string | null; name: string }): Promise<AnnotatedFigure | null>;
}

export const EditorUiContext = createContext<EditorUi>({
  uploadImage: async () => null,
  toast: () => {},
});

export const useEditorUi = () => useContext(EditorUiContext);
