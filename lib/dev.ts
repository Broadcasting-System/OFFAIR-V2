import "server-only";
import path from "node:path";

/** Edit mode is only ever available outside production builds. */
export const IS_DEV = process.env.NODE_ENV !== "production";

const CONTENT_DIR = path.join(process.cwd(), "content");

/**
 * Resolve a content-relative path (e.g. "docs/getting-started.mdx") to an
 * absolute path, refusing anything that escapes the content directory.
 */
export function resolveContentPath(relPath: string): string {
  const cleaned = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const full = path.normalize(path.join(CONTENT_DIR, cleaned));
  const rootWithSep = CONTENT_DIR + path.sep;
  if (full !== CONTENT_DIR && !full.startsWith(rootWithSep)) {
    throw new Error("Path escapes content directory");
  }
  if (!full.endsWith(".mdx")) {
    throw new Error("Only .mdx files are editable");
  }
  return full;
}

export const CONTENT_ROOT_DIR = CONTENT_DIR;
