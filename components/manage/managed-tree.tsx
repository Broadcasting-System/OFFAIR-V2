"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DocTree } from "@/components/shell/doc-tree";
import {
  CopyIcon,
  GripIcon,
  LinkIcon,
  MoreIcon,
  MoveIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/shell/icons";
import { toast } from "@/components/ui/toast";
import type { NavGroup } from "@/lib/content";
import { canEditNow, TREE_CHANGED_EVENT, useMe } from "@/lib/wiki/client";
import { docFromPath, docHref, type SpaceKey } from "@/lib/wiki/links";
import {
  buildForest,
  findNode,
  keyboardTarget,
  keyOf,
  subtreeKeys,
  type DropTarget,
  type KeyMove,
  type TGroup,
  type TNode,
} from "@/lib/wiki/tree-math";
import { DarkMenu, type MenuItem } from "./dark-menu";
import { MovePicker } from "./move-picker";
import {
  addCategory,
  createDoc,
  duplicateDoc,
  loadTree,
  moveDoc,
  treeSpace,
  removeCategory,
  renameCategory,
  renameDoc,
  trashDoc,
  useTree,
  type Nav,
} from "./tree-ops";

/**
 * 서랍의 문서 트리. 편집할 수 있는 사람(GET /api/me → canEdit)에게는
 * 시안 f3-A "트리에서 바로" 관리 기능을 붙인다:
 *  - 줄마다 ⋮⋮ 손잡이(끌어서 순서·위치·하위로), 마우스를 올리면 ＋(하위 문서)·⋯(메뉴)
 *  - 카테고리 머리에도 ＋·⋯
 *  - 키보드: 손잡이에서 ⌥↑/⌥↓ 위아래, ⌥→ 위 문서 안으로, ⌥← 밖으로, F2 이름 바꾸기
 * 읽기만 하는 사람은 예전 그대로의 트리(DocTree).
 */
export function ManagedTree({ nav, space = "guide", onNavigate }: { nav: NavGroup[]; space?: SpaceKey; onNavigate?: () => void }) {
  const me = useMe();
  if (!canEditNow(me)) {
    // 가이드북은 서버가 그린 트리, 부원 공간은 API 로 받는다 (정적 HTML 에 부원 문서가 들어가지 않게)
    if (space === "guide") return <DocTree nav={nav} onNavigate={onNavigate} />;
    return <FetchedTree space={space} onNavigate={onNavigate} />;
  }
  return <EditableTree key={space} nav={space === "guide" ? nav : []} space={space} onNavigate={onNavigate} />;
}

/** 읽기만 하는 사람의 부원 공간 트리 (API 로 받아 DocTree 로 그린다) */
function FetchedTree({ space, onNavigate }: { space: SpaceKey; onNavigate?: () => void }) {
  const { groups } = useTree();
  useEffect(() => {
    void loadTree(space).catch(() => undefined);
  }, [space]);
  const nav = useMemo<NavGroup[]>(
    () =>
      (treeSpace() === space ? groups ?? [] : []).map((g, i) => ({
        category: g.category,
        order: i,
        items: g.items.map((d, j) => ({ slug: d.slug, url: docHref(space, d.slug), title: d.title, description: "", category: g.category, order: j })),
      })),
    [groups, space]
  );
  if (!groups) return <p className="px-2 py-3 text-[13px] text-fg-3">불러오는 중…</p>;
  return <DocTree nav={nav.filter((g) => g.items.length > 0)} onNavigate={onNavigate} />;
}

function useNav(): Nav {
  const router = useRouter();
  return useMemo(
    () => ({ push: (h: string) => router.push(h), replace: (h: string) => router.replace(h), refresh: () => router.refresh() }),
    [router]
  );
}

/** 서랍 머리의 "＋ 새 문서" — 지금 보는 문서의 카테고리(없으면 첫 카테고리) 맨 끝에 */
export function NewDocButton({ compact = false }: { compact?: boolean }) {
  const me = useMe();
  const nav = useNav();
  const pathname = usePathname();
  const { groups, busy } = useTree();
  if (!canEditNow(me)) return null;
  function onClick() {
    const here = docFromPath(pathname);
    const gs = groups ?? [];
    const cat =
      (here && gs.find((g) => g.items.some((d) => keyOf(d) === here.slug.join("/")))?.category) || gs[0]?.category || "문서";
    void createDoc(nav, { category: cat });
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="새 문서"
      title="새 문서  N"
      className={
        compact
          ? "grid size-[42px] flex-none place-items-center rounded-lg border border-line bg-bg text-fg-2 transition-colors hover:bg-hover hover:text-fg disabled:opacity-60"
          : "inline-flex h-7 flex-none items-center gap-1 rounded-md border border-line bg-bg px-2.5 text-[12.5px] font-medium text-fg-2 transition-colors hover:bg-hover hover:text-fg disabled:opacity-60"
      }
    >
      <PlusIcon size={compact ? 17 : 14} />
      {!compact && "새 문서"}
    </button>
  );
}

const ROW_INDENT = 18;
const indentOf = (depth: number) => 2 + depth * ROW_INDENT;

interface DragView {
  key: string;
  title: string;
  x: number;
  y: number;
  target: DropTarget | null;
  line: { top: number; left: number } | null;
  inside: string | null;
  moving: Set<string>;
}

type Renaming = { kind: "doc"; key: string } | { kind: "cat"; name: string } | { kind: "newcat" } | null;
type MenuState = { kind: "doc"; key: string; category: string; anchor: HTMLElement } | { kind: "cat"; name: string; anchor: HTMLElement } | null;

function fromNav(nav: NavGroup[]): TGroup[] {
  return nav.map((g) => ({ category: g.category, items: g.items.map((d) => ({ slug: d.slug, title: d.title })) }));
}

function EditableTree({ nav, space, onNavigate }: { nav: NavGroup[]; space: SpaceKey; onNavigate?: () => void }) {
  const pathname = usePathname();
  const navOps = useNav();
  const { groups: loadedAny, highlight, busy } = useTree();
  const loaded = treeSpace() === space ? loadedAny : null;
  const groups = loaded ?? fromNav(nav);
  const containerRef = useRef<HTMLDivElement>(null);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<Renaming>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragView | null>(null);
  const dragRef = useRef<{
    key: string;
    title: string;
    x0: number;
    y0: number;
    started: boolean;
    moving: Set<string>;
    target: DropTarget | null;
  } | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const current = docFromPath(pathname);
  const currentKey = current?.space === space ? current.slug.join("/") : null;

  useEffect(() => {
    void loadTree(space).catch(() => undefined);
    const onChange = () => void loadTree(space).catch(() => undefined);
    window.addEventListener(TREE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(TREE_CHANGED_EVENT, onChange);
  }, [space]);

  // 옮긴 뒤 손잡이로 포커스를 돌려준다 (키보드로 이어서 옮길 수 있게)
  useEffect(() => {
    const k = pendingFocus.current;
    if (!k) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(k)}"] [data-grip]`);
    if (el) {
      el.focus();
      pendingFocus.current = null;
    }
  }, [loaded]);

  const forests = useMemo(() => groups.map((g) => ({ category: g.category, count: g.items.length, roots: buildForest(g.items) })), [groups]);

  function containsKey(node: TNode, key: string | null): boolean {
    if (!key) return false;
    return node.children.some((c) => keyOf(c.doc) === key || containsKey(c, key));
  }
  function isOpen(node: TNode) {
    const k = keyOf(node.doc);
    if (k in toggled) return toggled[k];
    return k === currentKey || containsKey(node, currentKey) || containsKey(node, highlight);
  }

  /* ───────────── 동작 ───────────── */

  async function doMove(key: string, target: DropTarget) {
    const next = await moveDoc(navOps, key, target);
    if (typeof next === "string") pendingFocus.current = next;
  }

  function onRowKey(e: React.KeyboardEvent, node: TNode) {
    const key = keyOf(node.doc);
    if (e.key === "F2") {
      e.preventDefault();
      setRenaming({ kind: "doc", key });
      return;
    }
    if (!e.altKey) return;
    const dir: Record<string, KeyMove> = { ArrowUp: "up", ArrowDown: "down", ArrowRight: "in", ArrowLeft: "out" };
    const m = dir[e.key];
    if (!m) return;
    e.preventDefault();
    const t = keyboardTarget(groups, key, m);
    if (!t) {
      toast({ message: "그쪽으로는 더 옮길 수 없어요" });
      return;
    }
    pendingFocus.current = key;
    void doMove(key, t);
  }

  function docMenu(key: string, category: string): MenuItem[] {
    const slug = key.split("/");
    return [
      { label: "하위 문서 만들기", icon: <PlusIcon size={15} />, run: () => void createDoc(navOps, { category, parent: slug }) },
      { label: "이름 바꾸기", icon: <PencilIcon size={15} />, kbd: "F2", run: () => setRenaming({ kind: "doc", key }) },
      { label: "다른 곳으로 옮기기", icon: <MoveIcon size={15} />, run: () => setPicker(key) },
      { label: "복제", icon: <CopyIcon size={15} />, run: () => void duplicateDoc(navOps, slug) },
      {
        label: "주소 복사",
        icon: <LinkIcon size={15} />,
        run: () => {
          const url = window.location.origin + docHref(space, slug);
          navigator.clipboard?.writeText(url).then(
            () => toast({ message: "주소를 복사했어요" }),
            () => toast({ message: url })
          );
        },
      },
      { label: "휴지통으로", icon: <TrashIcon size={15} />, danger: true, separated: true, run: () => void trashDoc(navOps, slug) },
    ];
  }

  function catMenu(name: string): MenuItem[] {
    const empty = (groups.find((g) => g.category === name)?.items.length ?? 0) === 0;
    return [
      { label: "이 카테고리에 문서", icon: <PlusIcon size={15} />, run: () => void createDoc(navOps, { category: name }) },
      { label: "이름 바꾸기", icon: <PencilIcon size={15} />, run: () => setRenaming({ kind: "cat", name }) },
      {
        label: "카테고리 지우기",
        icon: <TrashIcon size={15} />,
        danger: true,
        separated: true,
        disabled: !empty,
        hint: "문서가 남아 있는 카테고리는 지울 수 없어요",
        run: () => void removeCategory(navOps, name),
      },
    ];
  }

  /* ───────────── 끌어서 옮기기 ───────────── */

  function computeTarget(x: number, y: number, moving: Set<string>): Pick<DragView, "target" | "line" | "inside"> {
    const none = { target: null, line: null, inside: null };
    const box = containerRef.current;
    if (!box) return none;
    const cont = box.getBoundingClientRect();
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el || !box.contains(el)) return none;
    const row = el.closest<HTMLElement>("[data-row-key]");
    if (row) {
      const key = row.dataset.rowKey!;
      if (moving.has(key)) return none;
      const r = row.getBoundingClientRect();
      const depth = Number(row.dataset.depth || 0);
      const rel = (y - r.top) / r.height;
      if (rel < 0.28) return { target: { type: "before", key }, line: { top: r.top - cont.top, left: indentOf(depth) }, inside: null };
      if (rel > 0.72) {
        const first = row.dataset.firstChild;
        if (first && !moving.has(first)) {
          return { target: { type: "before", key: first }, line: { top: r.bottom - cont.top, left: indentOf(depth + 1) }, inside: null };
        }
        return { target: { type: "after", key }, line: { top: r.bottom - cont.top, left: indentOf(depth) }, inside: null };
      }
      return { target: { type: "inside", key }, line: null, inside: key };
    }
    const head = el.closest<HTMLElement>("[data-cat-head]");
    if (head) {
      const r = head.getBoundingClientRect();
      return { target: { type: "category", category: head.dataset.catHead!, at: "start" }, line: { top: r.bottom - cont.top, left: indentOf(0) }, inside: null };
    }
    const end = el.closest<HTMLElement>("[data-cat-end]");
    if (end) {
      const r = end.getBoundingClientRect();
      return { target: { type: "category", category: end.dataset.catEnd!, at: "end" }, line: { top: r.top - cont.top, left: indentOf(0) }, inside: null };
    }
    return none;
  }

  function onGripDown(e: React.PointerEvent, node: TNode) {
    if (e.button !== 0 || busy) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { key: keyOf(node.doc), title: node.doc.title, x0: e.clientX, y0: e.clientY, started: false, moving: subtreeKeys(node), target: null };
  }

  function onGripMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      d.started = true;
      setMenu(null);
    }
    // 서랍 가장자리에서는 저절로 굴린다
    const drawer = containerRef.current?.closest(".shell-drawer");
    if (drawer) {
      const r = drawer.getBoundingClientRect();
      if (e.clientY < r.top + 40) drawer.scrollBy(0, -10);
      else if (e.clientY > r.bottom - 40) drawer.scrollBy(0, 10);
    }
    const view = { key: d.key, title: d.title, x: e.clientX, y: e.clientY, moving: d.moving, ...computeTarget(e.clientX, e.clientY, d.moving) };
    d.target = view.target;
    setDrag(view);
  }

  function endDrag(drop: boolean) {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (drop && d?.started && d.target) void doMove(d.key, d.target);
  }

  const endDragRef = useRef(endDrag);
  useEffect(() => {
    endDragRef.current = endDrag;
  });

  // 손잡이 밖에서 손을 떼거나 Esc 를 눌러도 끝나게
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dragRef.current = null;
        setDrag(null);
      }
    };
    const onUp = () => endDragRef.current(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  /* ───────────── 그리기 ───────────── */

  const actBtn =
    "grid size-[22px] flex-none place-items-center rounded-[5px] text-fg-3 hover:bg-line-2 hover:text-fg focus-visible:opacity-100";
  const showActs = "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100";

  function renderNodes(nodes: TNode[], depth: number, category: string): React.ReactNode {
    return (
      <ul className="flex flex-col gap-px" role={depth === 0 ? undefined : "group"}>
        {nodes.map((node) => {
          const key = keyOf(node.doc);
          const active = key === currentKey;
          const kids = node.children.length > 0;
          const open = kids && isOpen(node);
          const isNew = key === highlight;
          const isDragging = !!drag?.moving.has(key);
          const dropInside = drag?.inside === key;
          const url = docHref(space, node.doc.slug);
          return (
            <li key={key}>
              <div
                data-row-key={key}
                data-depth={depth}
                data-first-child={open ? keyOf(node.children[0].doc) : undefined}
                onKeyDown={(e) => onRowKey(e, node)}
                className={`group/row relative flex items-center gap-0.5 rounded-md pr-1 text-[14px] leading-[1.35] transition-colors ${
                  dropInside
                    ? "bg-sel ring-2 ring-accent ring-inset"
                    : active
                      ? "bg-sel font-semibold text-accent"
                      : isNew
                        ? "bg-hover text-fg-2"
                        : "text-fg-2 hover:bg-hover"
                } ${isDragging ? "opacity-40" : ""}`}
                style={{ paddingLeft: indentOf(depth) }}
              >
                <button
                  type="button"
                  data-grip
                  aria-label={`「${node.doc.title}」 옮기기 (Alt+화살표)`}
                  title="끌어서 옮기기 · ⌥↑↓ 위아래 · ⌥→ 안으로 · ⌥← 밖으로"
                  onPointerDown={(e) => onGripDown(e, node)}
                  onPointerMove={onGripMove}
                  onPointerUp={() => endDrag(true)}
                  onPointerCancel={() => endDrag(false)}
                  className="grid h-6 w-4 flex-none cursor-grab touch-none place-items-center rounded text-fg-3 opacity-50 group-hover/row:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
                >
                  <GripIcon size={13} />
                </button>
                {kids ? (
                  <button
                    type="button"
                    onClick={() => setToggled((t) => ({ ...t, [key]: !open }))}
                    aria-expanded={open}
                    aria-label={`${node.doc.title} ${open ? "접기" : "펼치기"}`}
                    className="grid size-5 flex-none place-items-center rounded text-fg-3 hover:bg-line-2"
                  >
                    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`}>
                      <path d="M3 1.5 7.5 5 3 8.5z" fill="currentColor" />
                    </svg>
                  </button>
                ) : (
                  <span className="w-1 flex-none" aria-hidden />
                )}
                {renaming?.kind === "doc" && renaming.key === key ? (
                  <InlineInput
                    initial={node.doc.title}
                    label="문서 이름"
                    onDone={(v) => {
                      setRenaming(null);
                      if (v !== null && v.trim() && v.trim() !== node.doc.title) void renameDoc(navOps, node.doc.slug, v);
                    }}
                  />
                ) : (
                  <Link
                    href={url}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`min-w-0 flex-1 truncate rounded-md py-[5px] pr-1 pl-1 ${isNew && !active ? "text-fg-3" : ""}`}
                  >
                    {node.doc.title}
                  </Link>
                )}
                {isNew && <span className="flex-none px-1 text-[11px] font-semibold text-accent">새로 만듦</span>}
                <span className={`flex flex-none gap-0.5 ${showActs}`}>
                  <button
                    type="button"
                    aria-label={`「${node.doc.title}」 아래에 하위 문서 만들기`}
                    title="하위 문서 만들기"
                    onClick={() => void createDoc(navOps, { category, parent: node.doc.slug })}
                    className={actBtn}
                  >
                    <PlusIcon size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`「${node.doc.title}」 메뉴`}
                    aria-haspopup="menu"
                    aria-expanded={menu?.kind === "doc" && menu.key === key}
                    onClick={(e) => setMenu({ kind: "doc", key, category, anchor: e.currentTarget })}
                    className={actBtn}
                  >
                    <MoreIcon size={15} />
                  </button>
                </span>
              </div>
              {open && renderNodes(node.children, depth + 1, category)}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <nav aria-label="문서 트리 (관리)" className="relative" ref={containerRef} aria-busy={busy}>
      {loaded && forests.every((g) => g.count === 0) && (
        <div className="mx-2 mt-2 mb-3 rounded-md border border-dashed border-line px-3 py-4 text-center text-[13px] text-fg-3">
          아직 문서가 없어요
          <button
            type="button"
            onClick={() => void createDoc(navOps, { category: forests[0]?.category ?? "문서" })}
            disabled={busy}
            className="mx-auto mt-2 flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 text-[12.5px] font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60"
          >
            <PlusIcon size={14} />새 문서
          </button>
        </div>
      )}
      {forests.map((g) => (
        <section key={g.category} className="mt-3.5 first:mt-1">
          <div data-cat-head={g.category} className="group/row mx-2 mb-1 flex min-h-[22px] items-center gap-1">
            {renaming?.kind === "cat" && renaming.name === g.category ? (
              <InlineInput
                initial={g.category}
                label="카테고리 이름"
                small
                onDone={(v) => {
                  setRenaming(null);
                  if (v !== null) void renameCategory(navOps, g.category, v);
                }}
              />
            ) : (
              <h2 className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-[0.06em] text-fg-3">{g.category}</h2>
            )}
            <span className={`flex flex-none gap-0.5 ${showActs}`}>
              <button
                type="button"
                aria-label={`「${g.category}」 카테고리에 문서 만들기`}
                title="이 카테고리에 문서"
                onClick={() => void createDoc(navOps, { category: g.category })}
                className={actBtn}
              >
                <PlusIcon size={13} />
              </button>
              <button
                type="button"
                aria-label={`「${g.category}」 카테고리 메뉴`}
                aria-haspopup="menu"
                onClick={(e) => setMenu({ kind: "cat", name: g.category, anchor: e.currentTarget })}
                className={actBtn}
              >
                <MoreIcon size={14} />
              </button>
            </span>
          </div>
          {g.roots.length > 0 ? renderNodes(g.roots, 0, g.category) : null}
          <div
            data-cat-end={g.category}
            className={g.count === 0 ? "mx-2 rounded-md border border-dashed border-line px-2 py-1.5 text-[12px] text-fg-3" : "h-2"}
          >
            {g.count === 0 ? "비어 있어요 · 여기로 끌어다 놓기" : null}
          </div>
        </section>
      ))}

      <div className="mx-2 mt-3">
        {renaming?.kind === "newcat" ? (
          <InlineInput
            initial=""
            label="새 카테고리 이름"
            small
            onDone={(v) => {
              setRenaming(null);
              if (v) void addCategory(navOps, v);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setRenaming({ kind: "newcat" })}
            className="inline-flex items-center gap-1 rounded text-[12px] text-fg-3 hover:text-fg"
          >
            <PlusIcon size={13} />
            카테고리 추가
          </button>
        )}
      </div>

      {drag?.line && (
        <div aria-hidden className="pointer-events-none absolute right-2 z-10 h-0.5 rounded bg-accent" style={{ top: drag.line.top - 1, left: drag.line.left + 4 }}>
          <span className="absolute -top-[3px] -left-1 size-2 rounded-full border-2 border-accent bg-bg" />
        </div>
      )}
      {drag &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-[140] flex max-w-[240px] -rotate-1 items-center gap-1.5 rounded-md bg-bg px-2 py-[5px] text-[14px] text-fg-2 shadow-[0_8px_20px_rgba(9,30,66,0.2)]"
            style={{ left: drag.x + 10, top: drag.y - 14 }}
          >
            <GripIcon size={13} className="text-fg-3" />
            <span className="truncate">{drag.title}</span>
          </div>,
          document.body
        )}

      {menu?.kind === "doc" && (
        <DarkMenu label={`「${findNode(groups, menu.key)?.node.doc.title ?? ""}」 메뉴`} anchor={menu.anchor} items={docMenu(menu.key, menu.category)} onClose={() => setMenu(null)} />
      )}
      {menu?.kind === "cat" && <DarkMenu label={`「${menu.name}」 카테고리 메뉴`} anchor={menu.anchor} items={catMenu(menu.name)} onClose={() => setMenu(null)} />}
      {picker && (
        <MovePicker
          groups={groups}
          moving={picker}
          onClose={() => setPicker(null)}
          onPick={(t) => {
            const k = picker;
            setPicker(null);
            void doMove(k, t);
          }}
        />
      )}
    </nav>
  );
}

/** 줄 안에서 바로 이름 고치기. ↵ 저장, Esc 취소, 밖을 누르면 저장 */
function InlineInput({
  initial,
  label,
  small = false,
  onDone,
}: {
  initial: string;
  label: string;
  small?: boolean;
  onDone: (value: string | null) => void;
}) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <input
      autoFocus
      value={v}
      aria-label={label}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(v);
        else if (e.key === "Escape") finish(null);
      }}
      onBlur={() => finish(v)}
      className={`min-w-0 flex-1 rounded-md border border-accent bg-bg px-1.5 text-fg shadow-[0_0_0_3px_var(--accent-soft)] outline-none ${
        small ? "h-6 text-[12px]" : "my-[1px] h-7 text-[14px]"
      }`}
    />
  );
}
