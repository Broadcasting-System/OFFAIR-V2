/**
 * 서랍 트리에서 문서를 옮길 때의 계산 (순수 함수 — 화면·API 와 떨어져 있어 테스트한다).
 *
 * 트리 모양:
 *  - 카테고리마다 문서가 "평평한 순서"(frontmatter order)로 들어 있다.
 *  - 슬러그 앞부분이 같은 문서(a/b 는 a 의 하위)는 가장 가까운 조상 문서 아래에 보인다.
 * 옮기기 = (필요하면) 슬러그 바꾸기 + 카테고리별 평평한 순서 다시 정하기.
 * 문서를 옮기면 그 아래 하위 문서들도 함께 옮긴다.
 */

export interface TDoc {
  slug: string[];
  title: string;
}

export interface TGroup {
  category: string;
  items: TDoc[];
}

export interface TNode {
  doc: TDoc;
  children: TNode[];
  parent: TNode | null;
}

export type DropTarget =
  | { type: "before" | "after" | "inside"; key: string }
  | { type: "category"; category: string; at: "start" | "end" };

export interface MovePlan {
  groups: TGroup[];
  /** 슬러그가 바뀌는 문서 (옮기는 문서 + 하위) */
  renames: { from: string[]; to: string[] }[];
}

export type KeyMove = "up" | "down" | "in" | "out";

export const MAX_DEPTH = 6;

export const keyOf = (d: { slug: string[] }) => d.slug.join("/");

/** 카테고리 하나의 문서 → 트리 (가장 가까운 조상 문서 밑으로) */
export function buildForest(items: TDoc[]): TNode[] {
  const byKey = new Map<string, TNode>();
  for (const doc of items) byKey.set(keyOf(doc), { doc, children: [], parent: null });
  const roots: TNode[] = [];
  for (const doc of items) {
    const node = byKey.get(keyOf(doc))!;
    let parent: TNode | undefined;
    for (let i = doc.slug.length - 1; i > 0 && !parent; i--) parent = byKey.get(doc.slug.slice(0, i).join("/"));
    if (parent) {
      node.parent = parent;
      parent.children.push(node);
    } else roots.push(node);
  }
  return roots;
}

function walk(nodes: TNode[], fn: (n: TNode) => void) {
  for (const n of nodes) {
    fn(n);
    walk(n.children, fn);
  }
}

interface Found {
  gi: number;
  node: TNode;
  forest: TNode[];
}

export function findNode(groups: TGroup[], key: string): Found | null {
  for (let gi = 0; gi < groups.length; gi++) {
    const forest = buildForest(groups[gi].items);
    let hit: TNode | null = null;
    walk(forest, (n) => {
      if (!hit && keyOf(n.doc) === key) hit = n;
    });
    if (hit) return { gi, node: hit, forest };
  }
  return null;
}

/** 노드와 그 아래 모든 문서의 키 */
export function subtreeKeys(node: TNode): Set<string> {
  const out = new Set<string>();
  walk([node], (n) => out.add(keyOf(n.doc)));
  return out;
}

export class MoveError extends Error {}

/**
 * key 문서(와 하위)를 target 으로 옮긴 새 배치. 옮길 수 없으면 MoveError.
 * 바뀐 게 없으면 groups 가 그대로(내용이 같은) 나온다.
 */
export function planMove(groups: TGroup[], key: string, target: DropTarget): MovePlan {
  const src = findNode(groups, key);
  if (!src) throw new MoveError("옮길 문서를 찾을 수 없어요.");
  const moving = subtreeKeys(src.node);
  if (target.type !== "category" && moving.has(target.key)) {
    throw new MoveError("문서를 자기 안으로는 옮길 수 없어요.");
  }

  // 대상 카테고리와 새 부모
  let tgi: number;
  let parent: TDoc | null;
  let anchor: TNode | null = null;
  if (target.type === "category") {
    tgi = groups.findIndex((g) => g.category === target.category);
    if (tgi === -1) throw new MoveError("카테고리를 찾을 수 없어요.");
    parent = null;
  } else {
    const t = findNode(groups, target.key);
    if (!t) throw new MoveError("놓을 자리를 찾을 수 없어요.");
    tgi = t.gi;
    anchor = t.node;
    parent = target.type === "inside" ? t.node.doc : t.node.parent?.doc ?? null;
  }

  // 슬러그: 부모가 그대로면 건드리지 않는다
  const node = src.node;
  const oldParentKey = node.parent ? keyOf(node.parent.doc) : null;
  const newParentKey = parent ? keyOf(parent) : null;
  const leaf = node.doc.slug[node.doc.slug.length - 1];
  let base = node.doc.slug;
  if (oldParentKey !== newParentKey) base = parent ? [...parent.slug, leaf] : [leaf];
  const renameOf = (slug: string[]) => [...base, ...slug.slice(node.doc.slug.length)];
  const renames: MovePlan["renames"] = [];
  if (keyOf({ slug: base }) !== key) {
    const taken = new Set<string>();
    for (const g of groups) for (const d of g.items) if (!moving.has(keyOf(d))) taken.add(keyOf(d));
    for (const g of groups) {
      for (const d of g.items) {
        if (!moving.has(keyOf(d))) continue;
        const to = renameOf(d.slug);
        if (to.length > MAX_DEPTH) throw new MoveError("더 깊이 넣을 수 없어요 (6단계까지).");
        if (taken.has(to.join("/"))) throw new MoveError(`같은 주소의 문서가 이미 있어요: ${to.join("/")}`);
        renames.push({ from: d.slug, to });
      }
    }
  }
  const renamed = (d: TDoc): TDoc => (moving.has(keyOf(d)) ? { ...d, slug: renameOf(d.slug) } : d);

  // 평평한 순서: 옮기는 묶음을 빼고 자리에 끼운다
  const block = groups[src.gi].items.filter((d) => moving.has(keyOf(d))).map(renamed);
  const out = groups.map((g) => ({ category: g.category, items: g.items.filter((d) => !moving.has(keyOf(d))) }));
  const rest = out[tgi].items;
  let idx: number;
  if (target.type === "category") {
    idx = target.at === "start" ? 0 : rest.length;
  } else if (target.type === "before") {
    idx = rest.findIndex((d) => keyOf(d) === target.key);
  } else {
    // after·inside: 대상 문서의 하위까지 지난 다음
    const span = subtreeKeys(anchor!);
    let last = -1;
    rest.forEach((d, i) => {
      if (span.has(keyOf(d))) last = i;
    });
    idx = last + 1;
  }
  out[tgi].items = [...rest.slice(0, idx), ...block, ...rest.slice(idx)];
  return { groups: out, renames };
}

/** 키보드로 한 칸 옮길 때의 목적지. 갈 곳이 없으면 null */
export function keyboardTarget(groups: TGroup[], key: string, move: KeyMove): DropTarget | null {
  const f = findNode(groups, key);
  if (!f) return null;
  const siblings = f.node.parent ? f.node.parent.children : f.forest;
  const i = siblings.indexOf(f.node);
  switch (move) {
    case "up":
      if (i > 0) return { type: "before", key: keyOf(siblings[i - 1].doc) };
      if (!f.node.parent && f.gi > 0) return { type: "category", category: groups[f.gi - 1].category, at: "end" };
      return null;
    case "down":
      if (i < siblings.length - 1) return { type: "after", key: keyOf(siblings[i + 1].doc) };
      if (!f.node.parent && f.gi < groups.length - 1) return { type: "category", category: groups[f.gi + 1].category, at: "start" };
      return null;
    case "in":
      return i > 0 ? { type: "inside", key: keyOf(siblings[i - 1].doc) } : null;
    case "out":
      return f.node.parent ? { type: "after", key: keyOf(f.node.parent.doc) } : null;
  }
}

/** 두 배치가 같은가 (옮겨도 바뀐 게 없으면 API 를 부르지 않는다) */
export function sameLayout(a: TGroup[], b: TGroup[]): boolean {
  return JSON.stringify(a.map((g) => [g.category, g.items.map(keyOf)])) === JSON.stringify(b.map((g) => [g.category, g.items.map(keyOf)]));
}

/** PUT /sidebar 본문 */
export function sidebarPayload(groups: TGroup[]) {
  return { groups: groups.map((g) => ({ category: g.category, items: g.items.map(keyOf) })) };
}

/** 하위 문서용 새 슬러그: 부모 아래 base, 겹치면 base-2, base-3 … */
export function uniqueChildSlug(groups: TGroup[], parent: string[] | null, base: string): string[] {
  const taken = new Set(groups.flatMap((g) => g.items.map(keyOf)));
  const prefix = parent ?? [];
  let slug = [...prefix, base];
  for (let n = 2; taken.has(slug.join("/")); n++) slug = [...prefix, `${base}-${n}`];
  return slug;
}
