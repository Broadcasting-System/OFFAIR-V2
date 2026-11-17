import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Windows 에서 백신·탐색기가 파일을 잠깐 잡고 있을 때 나는 오류 */
function retryable(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException)?.code;
  return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= 5 || !retryable(e)) throw e;
      await sleep(50 * (i + 1));
    }
  }
}

/** 임시 파일에 쓴 뒤 바꿔치기 — 쓰다 끊겨도 반쪽 파일이 남지 않는다 */
export async function writeFileAtomic(file: string, data: string | Buffer): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fsp.writeFile(tmp, data);
  try {
    await withRetry(() => fsp.rename(tmp, file));
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    throw e;
  }
}

export async function removeFile(file: string): Promise<void> {
  await withRetry(() => fsp.rm(file, { force: true }));
  // 비어 버린 상위 폴더는 정리 (git 은 빈 폴더를 모른다)
  let dir = path.dirname(file);
  for (let i = 0; i < 6; i++) {
    try {
      if (fs.readdirSync(dir).length > 0) break;
      fs.rmdirSync(dir);
      dir = path.dirname(dir);
    } catch {
      break;
    }
  }
}

export function readIfExists(file: string): Buffer | null {
  try {
    return fs.readFileSync(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** 글은 언제나 \n 줄바꿈, BOM 없이 */
export function normalizeText(s: string): string {
  return s.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/** git 블롭 해시와 같은 방식(sha1 "blob <길이>\0<내용>") — 문서 리비전으로 쓴다 */
export function blobHash(content: string | Buffer): string {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return crypto
    .createHash("sha1")
    .update(`blob ${buf.length}\0`)
    .update(buf)
    .digest("hex");
}
