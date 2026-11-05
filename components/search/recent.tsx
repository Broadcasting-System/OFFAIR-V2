"use client";

import { useEffect } from "react";
import {
  isRecentDoc,
  isString,
  pushRecentDoc,
  pushRecentQuery,
  readList,
  type RecentDoc,
} from "@/lib/wiki/search-text";

/** 최근 본 문서·최근 찾은 말 — 이 브라우저에만 남는다 (localStorage) */

const DOCS_KEY = "offair-recent-docs";
const QUERIES_KEY = "offair-recent-queries";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 사생활 보호 모드 등 */
  }
}

export function recentDocs(): RecentDoc[] {
  return readList(read(DOCS_KEY), isRecentDoc);
}
export function recentQueries(): string[] {
  return readList(read(QUERIES_KEY), isString);
}
export function rememberQuery(q: string) {
  write(QUERIES_KEY, pushRecentQuery(recentQueries(), q));
}
export function rememberDoc(doc: RecentDoc) {
  write(DOCS_KEY, pushRecentDoc(recentDocs(), doc));
}

/** 문서 화면에 두면 "최근 본 문서" 에 남긴다 */
export function RecordVisit(doc: RecentDoc) {
  const { space, url, title, category } = doc;
  useEffect(() => {
    rememberDoc({ space, url, title, category });
  }, [space, url, title, category]);
  return null;
}
