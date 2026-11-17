/**
 * 이미지 올리기 전 손질 — 저장소 규칙(가이드 이미지는 ~1600px WebP)에 맞춰 줄인다.
 * GIF·SVG 는 그대로. 줄인 게 더 크면 원본을 쓴다.
 */
export interface PreparedImage {
  file: File;
  width: number | null;
  height: number | null;
}

const MAX_W = 1600;

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/") || /gif|svg/.test(file.type)) {
    return { file, width: null, height: null };
  }
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_W / bmp.width);
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.86));
    if (!blob || blob.size >= file.size) return { file, width: w, height: h };
    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return { file: new File([blob], name, { type: "image/webp" }), width: w, height: h };
  } catch {
    return { file, width: null, height: null };
  }
}

/** 파일 고르기 창 */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}
