/**
 * 올리기 전 그림 줄이기 — 긴 변 1920px 까지, WebP(품질 0.85)가 더 작으면 WebP 로.
 * 크기 계산·판단은 순수 함수, 실제 변환(prepareImage)만 브라우저 API 를 쓴다.
 */

export const MAX_LONG_SIDE = 1920;
export const WEBP_QUALITY = 0.85;

/** 긴 변이 max 를 넘으면 비율 그대로 줄인 크기. 안 넘으면 그대로. */
export function fitWithin(
  width: number,
  height: number,
  max = MAX_LONG_SIDE
): { width: number; height: number; scaled: boolean } {
  const long = Math.max(width, height);
  if (long <= max || long <= 0) return { width, height, scaled: false };
  const k = max / long;
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
    scaled: true,
  };
}

/**
 * 변환본을 쓸지. 크기를 줄였으면(=원본이 너무 큼) 무조건 변환본,
 * 아니면 변환본이 원본보다 충분히(3% 이상) 작을 때만.
 */
export function shouldUseConverted(originalBytes: number, convertedBytes: number, scaled: boolean): boolean {
  if (scaled) return true;
  return convertedBytes < originalBytes * 0.97;
}

/** 바이트 → "2.1MB" / "380KB" / "900B" */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1000) return `${n}B`;
  if (n < 1000 * 1000) return `${Math.round(n / 1024)}KB`;
  const mb = n / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10}MB`;
}

/** "2.1MB → 380KB 로 줄여 올려요" — 줄지 않았으면 null */
export function shrinkMessage(before: number, after: number): string | null {
  if (after >= before) return null;
  return `${formatBytes(before)} → ${formatBytes(after)} 로 줄여 올려요`;
}

/** 확장자를 바꾼 파일 이름 (시보-편집창.png → 시보-편집창.webp) */
export function replaceExt(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}.${ext}`;
}

/** 이 형식은 그대로 둔다 — 움직이는 GIF, 벡터 */
export function isPassthroughImage(type: string): boolean {
  return type === "image/gif" || type === "image/svg+xml";
}

export interface PreparedImage {
  /** 올릴 파일 (원본이거나 변환본) */
  file: File;
  width: number;
  height: number;
  originalSize: number;
  converted: boolean;
}

/** 그림 크기만 읽기 */
export async function readImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  const out = { width: bmp.width, height: bmp.height };
  bmp.close();
  return out;
}

/**
 * 브라우저에서 그림을 줄이고 WebP 로 바꿔 본다.
 * 해석할 수 없는 그림(예: Chrome 의 HEIC)은 Error.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (isPassthroughImage(file.type)) {
    const size = file.type === "image/gif" ? await readImageSize(file).catch(() => ({ width: 0, height: 0 })) : { width: 0, height: 0 };
    return { file, ...size, originalSize: file.size, converted: false };
  }
  let bmp: ImageBitmap;
  try {
    // EXIF 방향을 반영해서 읽는다 (휴대폰 사진)
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("이 그림 형식은 브라우저가 읽지 못해요 (HEIC 이면 JPG·PNG 로 바꿔 주세요)");
  }
  const target = fitWithin(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bmp.close();
    return { file, width: target.width, height: target.height, originalSize: file.size, converted: false };
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, target.width, target.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", WEBP_QUALITY));
  canvas.width = 0;
  canvas.height = 0;
  if (blob && blob.type === "image/webp" && shouldUseConverted(file.size, blob.size, target.scaled)) {
    return {
      file: new File([blob], replaceExt(file.name, "webp"), { type: "image/webp", lastModified: Date.now() }),
      width: target.width,
      height: target.height,
      originalSize: file.size,
      converted: true,
    };
  }
  // WebP 인코딩을 못 하는 브라우저인데 크기는 줄여야 하면 PNG 로라도
  if (target.scaled) {
    const c2 = document.createElement("canvas");
    c2.width = target.width;
    c2.height = target.height;
    const b2 = await createImageBitmap(file, { imageOrientation: "from-image" });
    c2.getContext("2d")?.drawImage(b2, 0, 0, target.width, target.height);
    b2.close();
    const png = await new Promise<Blob | null>((r) => c2.toBlob(r, "image/png"));
    if (png) {
      return {
        file: new File([png], replaceExt(file.name, "png"), { type: "image/png", lastModified: Date.now() }),
        width: target.width,
        height: target.height,
        originalSize: file.size,
        converted: true,
      };
    }
  }
  return { file, width: target.width, height: target.height, originalSize: file.size, converted: false };
}
