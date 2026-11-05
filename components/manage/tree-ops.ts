"use client";

import { useSyncExternalStore } from "react";
import { toast } from "@/components/ui/toast";
import { api, ApiError, emitTreeChanged } from "@/lib/wiki/client";
import { docHref, editHref, josa, type SpaceKey } from "@/lib/wiki/links";
import {
  findNode,
  keyOf,
  MoveError,
  planMove,
  sameLayout,
  sidebarPayload,
  subtreeKeys,
  uniqueChildSlug,
  type DropTarget,
  type TGroup,
} from "@/lib/wiki/tree-math";

/**
 * 서랍 트리의 문서 관리(만들기·옮기기·이름 바꾸기·복제·휴지통) 동작과 트리 상태.
 * 트리 상태는 모듈 하나에 두고(useTree), 서랍·명령 팔레트가 같이 쓴다.
 * 바꾼 뒤에는 언제나 서버 트리를 다시 받아 맞춘다.
 */

const SPACE: SpaceKey = "guide";
const base = `/api/wiki/${SPACE}`;
const NEW_TITLE = "제목 없는 문서";

export interface TreeState {
  groups: TGroup[] | null;
  /** "새로 만듦" 으로 잠깐 강조할 문서 키 */
  highlight: string | null;
  busy: boolean;
}

let state: TreeState = { groups: null, highlight: null, busy: false };
const listeners = new Set<() => void>();
function set(patch: Partial<TreeState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
const SERVER: TreeState = { groups: null, highlight: null, busy: false };

export function useTree(): TreeState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER
  );
}

/** 라우터에서 필요한 것만 (next/navigation 의 useRouter 결과) */
export interface Nav {
  push: (href: string) => void;
  replace: (href: string) => void;
  refresh: () => void;
}

interface ApiTree {
  groups: { category: string; items: { slug: string[]; title: string }[] }[];
}

export async function loadTree(): Promise<TGroup[]> {
  const t = await api<ApiTree>(`${base}/tree`);
  const groups = t.groups.map((g) => ({ category: g.category, items: g.items.map((i) => ({ slug: i.slug, title: i.title })) }));
  set({ groups });
  if (!state.highlight) restoreHighlight();
  return groups;
}

/* "새로 만듦" 강조 — 편집 화면으로 넘어가며 페이지가 새로 열려도 이어지게 sessionStorage 에도 둔다 */
const HL_KEY = "offair-tree-new";
const HL_MS = 10_000;
let hlTimer: ReturnType<typeof setTimeout> | null = null;

function showHighlight(key: string, ms: number) {
  set({ highlight: key });
  if (hlTimer) clearTimeout(hlTimer);
  hlTimer = setTimeout(() => set({ highlight: null }), ms);
}

function highlight(key: string) {
  try {
    sessionStorage.setItem(HL_KEY, JSON.stringify({ key, until: Date.now() + HL_MS }));
  } catch {
    /* 저장 못 해도 화면 강조는 한다 */
  }
  showHighlight(key, HL_MS);
}

function restoreHighlight() {
  try {
    const v = JSON.parse(sessionStorage.getItem(HL_KEY) || "null") as { key: string; until: number } | null;
    if (v && v.until > Date.now()) showHighlight(v.key, v.until - Date.now());
  } catch {
    /* 무시 */
  }
}

const slugUrl = (slug: string[]) => slug.map(encodeURIComponent).join("/");
const q = (s: string) => `「${s}」`;
const obj = (s: string) => `${q(s)}${josa(s, "을", "를")}`;

function fail(e: unknown) {
  const msg = e instanceof ApiError || e instanceof MoveError ? e.message : "요청이 실패했어요.";
  toast({ message: msg, tone: "error" });
}

async function run<T>(nav: Nav, task: () => Promise<T>): Promise<T | undefined> {
  if (state.busy) return undefined;
  set({ busy: true });
  try {
    return await task();
  } catch (e) {
    fail(e);
    await loadTree().catch(() => undefined);
    return undefined;
  } finally {
    set({ busy: false });
    nav.refresh();
  }
}

function groupsNow(): TGroup[] {
  return state.groups ?? [];
}

/** 서버 트리를 아직 안 받았으면 받아 온다 (옮기기 계산은 언제나 서버 트리 기준) */
async function ensureGroups(): Promise<TGroup[]> {
  return state.groups ?? (await loadTree());
}

function titleOf(key: string): string {
  return findNode(groupsNow(), key)?.node.doc.title ?? key;
}

/** 지금 보는 문서가 slug 면 (옮기거나 지웠을 때 따라가려고) */
function viewing(slug: string[]): boolean {
  return decodeURIComponent(window.location.pathname) === `/docs/${slug.join("/")}`;
}

/* ───────────────────────── 만들기 ───────────────────────── */

/** 새 문서를 만들고 트리에 강조한 뒤 편집 화면으로. parent 가 있으면 그 하위로 */
export function createDoc(nav: Nav, where: { category: string; parent?: string[] | null }) {
  return run(nav, async () => {
    const groups = await ensureGroups();
    const slug = where.parent ? uniqueChildSlug(groups, where.parent, "제목-없는-문서") : undefined;
    const r = await api<{ doc: { slug: string[]; title: string } }>(`${base}/docs`, {
      method: "POST",
      body: { title: NEW_TITLE, category: where.category, ...(slug ? { slug } : {}) },
    });
    const key = keyOf(r.doc);
    highlight(key);
    await loadTree();
    emitTreeChanged({ space: SPACE, highlight: key });
    toast({
      message: "새 문서를 만들었어요",
      action: { label: "되돌리기", run: () => removeQuietly(nav, r.doc.slug) },
    });
    // 트리에서 새 자리를 잠깐 보여 준 뒤 편집 화면으로
    setTimeout(() => nav.push(editHref(SPACE, r.doc.slug)), 700);
    return r.doc;
  });
}

async function removeQuietly(nav: Nav, slug: string[]) {
  await run(nav, async () => {
    await api(`${base}/docs/${slugUrl(slug)}`, { method: "DELETE" });
    await loadTree();
    if (window.location.pathname.includes(slugUrl(slug))) nav.push("/");
  });
}

/* ───────────────────────── 옮기기 ───────────────────────── */

function describe(title: string, t: DropTarget): string {
  if (t.type === "category") return `${obj(title)} ${q(t.category)} 카테고리로 옮겼어요`;
  const other = titleOf(t.key);
  if (t.type === "inside") return `${obj(title)} ${q(other)} 안으로 옮겼어요`;
  return `${obj(title)} ${q(other)} ${t.type === "before" ? "위로" : "아래로"} 옮겼어요`;
}

async function applyLayout(renames: { from: string[]; to: string[] }[], groups: TGroup[]) {
  for (const r of renames) {
    await api(`${base}/move`, { method: "POST", body: { from: r.from, to: r.to } });
  }
  await api(`${base}/sidebar`, { method: "PUT", body: sidebarPayload(groups) });
}

/** key 문서를 target 으로. 성공하면 토스트에 되돌리기 */
export function moveDoc(nav: Nav, key: string, target: DropTarget) {
  return run(nav, async () => {
    const before = await ensureGroups();
    const plan = planMove(before, key, target);
    if (plan.renames.length === 0 && sameLayout(plan.groups, before)) return null;
    const title = titleOf(key);
    const message = describe(title, target);
    set({ groups: plan.groups }); // 먼저 보여 주고 서버에 쓴다
    await applyLayout(plan.renames, plan.groups);
    await loadTree();
    const moved = plan.renames.find((r) => viewing(r.from));
    if (moved) nav.replace(docHref(SPACE, moved.to));
    toast({
      message,
      action: {
        label: "되돌리기",
        run: () =>
          run(nav, async () => {
            set({ groups: before });
            await applyLayout(
              plan.renames.map((r) => ({ from: r.to, to: r.from })),
              before
            );
            await loadTree();
            const back = plan.renames.find((r) => viewing(r.to));
            if (back) nav.replace(docHref(SPACE, back.from));
            toast({ message: "되돌렸어요" });
          }),
      },
    });
    const newKey = plan.renames.find((r) => keyOf({ slug: r.from }) === key)?.to.join("/") ?? key;
    return newKey;
  });
}

/* ───────────────────────── 이름 바꾸기·복제 ───────────────────────── */

interface FullDoc {
  slug: string[];
  title: string;
  rev: string;
  category: string;
  description: string;
  body: string;
  frontmatter: Record<string, unknown>;
}

const getDoc = (slug: string[]) => api<FullDoc>(`${base}/docs/${slugUrl(slug)}`);

async function setTitle(slug: string[], title: string) {
  const d = await getDoc(slug);
  if (d.title === title) return d.title;
  await api(`${base}/docs/${slugUrl(slug)}`, {
    method: "PUT",
    body: { baseRev: d.rev, frontmatter: { title }, message: `이름 바꿈: ${d.title} → ${title}` },
  });
  return d.title;
}

export function renameDoc(nav: Nav, slug: string[], title: string) {
  const clean = title.trim();
  if (!clean) return Promise.resolve(undefined);
  return run(nav, async () => {
    const old = await setTitle(slug, clean);
    if (old === clean) return;
    await loadTree();
    toast({
      message: `이름을 ${q(clean)}${josa(clean, "으로", "로")} 바꿨어요`,
      action: {
        label: "되돌리기",
        run: () =>
          run(nav, async () => {
            await setTitle(slug, old);
            await loadTree();
          }),
      },
    });
  });
}

export function duplicateDoc(nav: Nav, slug: string[]) {
  return run(nav, async () => {
    const d = await getDoc(slug);
    const groups = await ensureGroups();
    const parent = slug.length > 1 ? slug.slice(0, -1) : null;
    const newSlug = uniqueChildSlug(groups, parent, `${slug[slug.length - 1]}-사본`);
    const fm = { ...d.frontmatter };
    for (const k of ["title", "category", "order", "description"]) delete fm[k];
    const title = `${d.title} 사본`;
    const r = await api<{ doc: { slug: string[] } }>(`${base}/docs`, {
      method: "POST",
      body: { title, category: d.category, description: d.description, slug: newSlug, body: d.body, frontmatter: fm, message: `${d.title} 복제` },
    });
    const fresh = await loadTree();
    const key = keyOf(r.doc);
    // 원본 바로 아래로
    const plan = planMove(fresh, key, { type: "after", key: keyOf({ slug }) });
    if (!sameLayout(plan.groups, fresh)) {
      set({ groups: plan.groups });
      await api(`${base}/sidebar`, { method: "PUT", body: sidebarPayload(plan.groups) });
      await loadTree();
    }
    highlight(key);
    toast({
      message: `${obj(d.title)} 복제했어요`,
      action: { label: "되돌리기", run: () => removeQuietly(nav, r.doc.slug) },
    });
  });
}

/* ───────────────────────── 휴지통 ───────────────────────── */

/** 문서(와 하위)를 휴지통으로. 되돌리기는 지운 커밋에서 되살린다 */
export function trashDoc(nav: Nav, slug: string[]) {
  return run(nav, async () => {
    const key = keyOf({ slug });
    const f = findNode(await ensureGroups(), key);
    const keys = f ? [...subtreeKeys(f.node)] : [key];
    const title = f?.node.doc.title ?? key;
    // 깊은 것부터 지운다
    keys.sort((a, b) => b.split("/").length - a.split("/").length);
    const done: { slug: string[]; rev: string }[] = [];
    try {
      for (const k of keys) {
        const s = k.split("/");
        const r = await api<{ commit: string | null }>(`${base}/docs/${slugUrl(s)}`, { method: "DELETE" });
        if (r.commit) done.push({ slug: s, rev: r.commit });
      }
    } finally {
      await loadTree();
    }
    const wasViewing = keys.some((k) => viewing(k.split("/")));
    if (wasViewing) nav.push("/");
    const more = keys.length > 1 ? ` (하위 ${keys.length - 1}개 포함)` : "";
    toast({
      message: `${obj(title)} 휴지통으로 옮겼어요${more}`,
      action: {
        label: "되돌리기",
        run: () =>
          run(nav, async () => {
            for (const d of [...done].reverse()) await restoreDoc(d.slug, d.rev);
            await loadTree();
            if (wasViewing) nav.push(docHref(SPACE, slug));
            toast({ message: `${obj(title)} 되살렸어요` });
          }),
      },
    });
  });
}

/** 휴지통에서 되살리기 (지운 커밋 rev) */
export async function restoreDoc(slug: string[], rev: string, space: SpaceKey = SPACE) {
  await api(`/api/wiki/${space}/revert/${slugUrl(slug)}`, { method: "POST", body: { rev, message: "휴지통에서 되살림" } });
}

/* ───────────────────────── 카테고리 ───────────────────────── */

export function renameCategory(nav: Nav, from: string, to: string) {
  const clean = to.trim();
  if (!clean || clean === from) return Promise.resolve(undefined);
  return run(nav, async () => {
    await api(`${base}/sidebar`, { method: "PATCH", body: { action: "rename", from, to: clean } });
    await loadTree();
    toast({
      message: `카테고리 이름을 ${q(clean)}${josa(clean, "으로", "로")} 바꿨어요`,
      action: {
        label: "되돌리기",
        run: () =>
          run(nav, async () => {
            await api(`${base}/sidebar`, { method: "PATCH", body: { action: "rename", from: clean, to: from } });
            await loadTree();
          }),
      },
    });
  });
}

export function removeCategory(nav: Nav, name: string) {
  return run(nav, async () => {
    const index = groupsNow().findIndex((g) => g.category === name);
    await api(`${base}/sidebar`, { method: "PATCH", body: { action: "remove", name } });
    await loadTree();
    toast({
      message: `${q(name)} 카테고리를 지웠어요`,
      action: {
        label: "되돌리기",
        run: () =>
          run(nav, async () => {
            await api(`${base}/sidebar`, { method: "PATCH", body: { action: "add", name, index: Math.max(0, index) } });
            await loadTree();
          }),
      },
    });
  });
}

export function addCategory(nav: Nav, name: string) {
  const clean = name.trim();
  if (!clean) return Promise.resolve(undefined);
  return run(nav, async () => {
    await api(`${base}/sidebar`, { method: "PATCH", body: { action: "add", name: clean } });
    await loadTree();
  });
}
