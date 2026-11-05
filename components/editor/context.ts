"use client";

import { createContext, useContext } from "react";

/** 노드 뷰(상자·그림 등)가 편집기 바깥 기능을 쓸 때 — 파일 올리기, 알림 */
export interface EditorUi {
  uploadImage(file: File): Promise<{ url: string; width: number | null; height: number | null } | null>;
  toast(message: string): void;
}

export const EditorUiContext = createContext<EditorUi>({
  uploadImage: async () => null,
  toast: () => {},
});

export const useEditorUi = () => useContext(EditorUiContext);
