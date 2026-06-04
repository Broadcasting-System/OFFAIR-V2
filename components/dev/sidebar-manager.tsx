"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createDoc, deleteDoc, updateSidebar } from "@/app/edit/actions";

export interface ManagerItem {
  relPath: string;
  title: string;
  url: string;
}
export interface ManagerGroup {
  category: string;
  items: ManagerItem[];
}

interface Props {
  initialGroups: ManagerGroup[];
  otherFiles: { relPath: string; title: string; url: string | null }[];
}

let gidSeq = 0;
type Group = { id: string; category: string; items: ManagerItem[] };

function withIds(groups: ManagerGroup[]): Group[] {
  return groups.map((g) => ({ id: `g${gidSeq++}`, ...g }));
}

function serialize(groups: Group[]): string {
  return JSON.stringify(
    groups.map((g) => ({ c: g.category, i: g.items.map((it) => it.relPath) }))
  );
}

const DragHandle = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
);

export function SidebarManager({ initialGroups, otherFiles }: Props) {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>(() => withIds(initialGroups));
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    serialize(withIds(initialGroups))
  );
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<
    { type: "category" | "item"; label: string } | null
  >(null);

  const dirty = useMemo(
    () => serialize(groups) !== savedSnapshot,
    [groups, savedSnapshot]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /* ---------- helpers ---------- */
  const renameCat = (id: string, value: string) =>
    setGroups((p) => p.map((g) => (g.id === id ? { ...g, category: value } : g)));

  const addCat = () =>
    setGroups((p) => [
      ...p,
      { id: `g${gidSeq++}`, category: "새 카테고리", items: [] },
    ]);

  const removeCat = (id: string) =>
    setGroups((p) => {
      if (p.length <= 1) return p;
      const idx = p.findIndex((g) => g.id === id);
      if (idx === -1) return p;
      const victim = p[idx];
      if (
        victim.items.length > 0 &&
        !confirm(
          `"${victim.category}" 카테고리에 ${victim.items.length}개 문서가 있습니다. 인접 카테고리로 옮기고 삭제할까요?`
        )
      )
        return p;
      const targetIdx = idx === 0 ? 1 : idx - 1;
      return p
        .map((g, i) =>
          i === targetIdx ? { ...g, items: [...g.items, ...victim.items] } : g
        )
        .filter((g) => g.id !== id);
    });

  /* ---------- drag handlers ---------- */
  const onDragStart = (e: DragStartEvent) => {
    const t = e.active.data.current?.type as "category" | "item" | undefined;
    if (t === "category") {
      const g = groups.find((g) => g.id === e.active.id);
      setActive({ type: "category", label: g?.category ?? "" });
    } else {
      const it = groups
        .flatMap((g) => g.items)
        .find((it) => it.relPath === e.active.id);
      setActive({ type: "item", label: it?.title ?? "" });
    }
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active: a, over } = e;
    if (!over || a.data.current?.type !== "item") return;
    setGroups((prev) => {
      const find = (id: string | number) =>
        prev.some((g) => g.id === id)
          ? (id as string)
          : prev.find((g) => g.items.some((it) => it.relPath === id))?.id;
      const ac = find(a.id);
      const oc = find(over.id);
      if (!ac || !oc || ac === oc) return prev;
      const ag = prev.find((g) => g.id === ac)!;
      const og = prev.find((g) => g.id === oc)!;
      const ai = ag.items.findIndex((it) => it.relPath === a.id);
      if (ai < 0) return prev;
      const moved = ag.items[ai];
      let ni: number;
      if (over.id === oc) ni = og.items.length;
      else {
        const oi = og.items.findIndex((it) => it.relPath === over.id);
        ni = oi < 0 ? og.items.length : oi;
      }
      return prev.map((g) => {
        if (g.id === ac)
          return { ...g, items: g.items.filter((_, i) => i !== ai) };
        if (g.id === oc) {
          const arr = [...g.items];
          arr.splice(ni, 0, moved);
          return { ...g, items: arr };
        }
        return g;
      });
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active: a, over } = e;
    setActive(null);
    if (!over) return;
    const type = a.data.current?.type;
    setGroups((prev) => {
      const find = (id: string | number) =>
        prev.some((g) => g.id === id)
          ? (id as string)
          : prev.find((g) => g.items.some((it) => it.relPath === id))?.id;

      if (type === "category") {
        const overCat = find(over.id);
        if (!overCat || a.id === overCat) return prev;
        const oldI = prev.findIndex((g) => g.id === a.id);
        const newI = prev.findIndex((g) => g.id === overCat);
        if (oldI < 0 || newI < 0) return prev;
        return arrayMove(prev, oldI, newI);
      }

      // item — reorder within its current container
      const oc = find(over.id);
      if (!oc) return prev;
      const gi = prev.findIndex((g) => g.id === oc);
      const items = prev[gi].items;
      const oldI = items.findIndex((it) => it.relPath === a.id);
      if (oldI < 0) return prev;
      const newI =
        over.id === oc
          ? items.length - 1
          : items.findIndex((it) => it.relPath === over.id);
      const arr = arrayMove(items, oldI, newI < 0 ? items.length - 1 : newI);
      return prev.map((g, i) => (i === gi ? { ...g, items: arr } : g));
    });
  };

  /* ---------- persistence ---------- */
  const saveLayout = () =>
    startTransition(async () => {
      const res = await updateSidebar({
        groups: groups.map((g) => ({
          category: g.category,
          items: g.items.map((it) => ({ relPath: it.relPath })),
        })),
      });
      if (res.ok) {
        setSavedSnapshot(serialize(groups));
        setStatus("레이아웃 저장됨 ✓");
        router.refresh();
      } else setStatus(res.error ?? "저장 실패");
      setTimeout(() => setStatus(null), 2500);
    });

  const onDelete = (item: ManagerItem) =>
    startTransition(async () => {
      if (!confirm(`"${item.title}" 문서를 삭제할까요? 되돌릴 수 없습니다.`))
        return;
      const res = await deleteDoc(item.relPath);
      if (res.ok) {
        setGroups((p) =>
          p.map((g) => ({
            ...g,
            items: g.items.filter((it) => it.relPath !== item.relPath),
          }))
        );
        setStatus(`"${item.title}" 삭제됨`);
        router.refresh();
      } else setStatus(res.error ?? "삭제 실패");
      setTimeout(() => setStatus(null), 2500);
    });

  return (
    <div className="space-y-6">
      <Toolbar
        dirty={dirty}
        pending={pending}
        status={status}
        onSave={saveLayout}
        onAddCat={addCat}
      />

      <NewDocForm
        categories={groups.map((g) => g.category)}
        onCreated={(item, category) =>
          setGroups((p) =>
            p.map((g) =>
              g.category === category ? { ...g, items: [...g.items, item] } : g
            )
          )
        }
        onStatus={(s) => {
          setStatus(s);
          setTimeout(() => setStatus(null), 2500);
        }}
      />

      <DndContext
        id="sidebar-manager"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
      >
        <SortableContext
          items={groups.map((g) => g.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {groups.map((group) => (
              <SortableCategory
                key={group.id}
                group={group}
                onRename={renameCat}
                onRemove={removeCat}
                onDeleteItem={onDelete}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {active ? (
            <div
              className={`rounded-md border px-3 py-2 text-sm shadow-glow backdrop-blur ${
                active.type === "category"
                  ? "border-beam-500/50 bg-ink-900 font-display font-bold uppercase tracking-wider text-beam-300"
                  : "border-line-strong bg-ink-800 text-fg"
              }`}
            >
              {active.label}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {otherFiles.length > 0 && (
        <div className="rounded-xl border border-line bg-ink-900/50 p-4">
          <h3 className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-fg-faint">
            기타 문서 (사이드바 외)
          </h3>
          <ul className="space-y-1">
            {otherFiles.map((f) => (
              <li key={f.relPath} className="flex items-center gap-2">
                <Link
                  href={`/edit/${f.relPath.replace(/\.mdx$/, "")}`}
                  className="text-sm text-fg transition-colors hover:text-beam-200"
                >
                  {f.title}
                </Link>
                {f.url && (
                  <Link
                    href={f.url}
                    className="text-xs text-fg-faint hover:text-beam-300"
                  >
                    ↗
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── sortable category ───────────────────────── */

function SortableCategory({
  group,
  onRename,
  onRemove,
  onDeleteItem,
}: {
  group: Group;
  onRename: (id: string, v: string) => void;
  onRemove: (id: string) => void;
  onDeleteItem: (item: ManagerItem) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id, data: { type: "category" } });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-xl border border-line bg-ink-900/50 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-0.5 text-fg-faint hover:text-fg active:cursor-grabbing"
          title="드래그하여 카테고리 순서 변경"
          aria-label="카테고리 이동"
        >
          {DragHandle}
        </button>
        <input
          value={group.category}
          onChange={(e) => onRename(group.id, e.target.value)}
          className="flex-1 rounded bg-transparent px-1 py-0.5 font-display text-sm font-bold uppercase tracking-wider text-beam-300 outline-none focus:bg-ink-800"
        />
        <span className="font-mono text-xs text-fg-faint">
          {group.items.length}
        </span>
        <button
          type="button"
          onClick={() => onRemove(group.id)}
          className="rounded px-1.5 text-fg-faint transition-colors hover:text-rose-300"
          title="카테고리 삭제"
        >
          ✕
        </button>
      </div>

      <SortableContext
        items={group.items.map((it) => it.relPath)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="min-h-[2.75rem] p-2">
          {group.items.length === 0 && (
            <li className="px-2 py-3 text-center text-xs text-fg-faint">
              여기로 문서를 끌어다 놓으세요
            </li>
          )}
          {group.items.map((item) => (
            <SortableItem
              key={item.relPath}
              item={item}
              group={group.id}
              onDelete={onDeleteItem}
            />
          ))}
        </ul>
      </SortableContext>
    </section>
  );
}

function SortableItem({
  item,
  group,
  onDelete,
}: {
  item: ManagerItem;
  group: string;
  onDelete: (item: ManagerItem) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.relPath, data: { type: "item", group } });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-ink-800 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none rounded p-0.5 text-fg-faint hover:text-fg active:cursor-grabbing"
        aria-label="문서 이동"
      >
        {DragHandle}
      </button>
      <Link
        href={`/edit/${item.relPath.replace(/\.mdx$/, "")}`}
        className="flex-1 truncate text-sm text-fg transition-colors hover:text-beam-200"
      >
        {item.title}
      </Link>
      <Link
        href={item.url}
        className="text-xs text-fg-faint opacity-0 transition-opacity hover:text-beam-300 group-hover:opacity-100"
        title="문서 보기"
      >
        ↗
      </Link>
      <button
        type="button"
        onClick={() => onDelete(item)}
        className="rounded px-1.5 text-fg-faint opacity-0 transition-opacity hover:text-rose-300 group-hover:opacity-100"
        title="문서 삭제"
      >
        ✕
      </button>
    </li>
  );
}

/* ───────────────────────── sub-components ───────────────────────── */

function Toolbar({
  dirty,
  pending,
  status,
  onSave,
  onAddCat,
}: {
  dirty: boolean;
  pending: boolean;
  status: string | null;
  onSave: () => void;
  onAddCat: () => void;
}) {
  return (
    <div className="sticky top-16 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-ink-900/80 px-4 py-3 backdrop-blur">
      <p className="text-sm text-fg-muted">
        손잡이를 끌어 문서·카테고리 순서를 바꾸고{" "}
        <strong className="text-fg">저장</strong>하세요.
      </p>
      <button
        type="button"
        onClick={onAddCat}
        className="rounded-md border border-line px-3 py-1.5 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-white"
      >
        + 카테고리
      </button>
      <div className="ml-auto flex items-center gap-3">
        {status && (
          <span className="font-mono text-xs text-emerald-300">{status}</span>
        )}
        {dirty && !status && (
          <span className="font-mono text-xs text-amber-300">변경됨</span>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || pending}
          className="rounded-md bg-beam-500 px-4 py-1.5 text-sm font-medium text-ink-950 transition-colors hover:bg-beam-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "저장 중…" : "레이아웃 저장"}
        </button>
      </div>
    </div>
  );
}

function NewDocForm({
  categories,
  onCreated,
  onStatus,
}: {
  categories: string[];
  onCreated: (item: ManagerItem, category: string) => void;
  onStatus: (s: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "문서");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const res = await createDoc({ title, category, slug });
      if (res.ok && res.url && res.relPath) {
        onCreated(
          { title: title.trim(), url: res.url, relPath: res.relPath },
          category
        );
        onStatus(`"${title.trim()}" 생성됨`);
        setTitle("");
        setSlug("");
        setOpen(false);
        router.refresh();
      } else onStatus(res.error ?? "생성 실패");
    });

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-line-strong py-3 text-sm text-fg-muted transition-colors hover:border-beam-500/50 hover:text-beam-200"
      >
        + 새 문서 만들기
      </button>
    );

  return (
    <div className="rounded-xl border border-beam-500/30 bg-ink-900/60 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="flex flex-col gap-1 text-xs text-fg-faint">
          제목
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예) 조명 콘솔 사용법"
            className="rounded-md border border-line bg-ink-850 px-3 py-2 text-sm text-fg outline-none focus:border-beam-500/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-faint">
          슬러그 (선택)
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="lighting-console"
            className="rounded-md border border-line bg-ink-850 px-3 py-2 font-mono text-sm text-fg outline-none focus:border-beam-500/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-faint">
          카테고리
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-line bg-ink-850 px-3 py-2 text-sm text-fg outline-none focus:border-beam-500/60"
          >
            {[...new Set(categories)].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-line px-3 py-1.5 text-sm text-fg-muted hover:text-white"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || pending}
          className="rounded-md bg-beam-500 px-4 py-1.5 text-sm font-medium text-ink-950 hover:bg-beam-400 disabled:opacity-40"
        >
          {pending ? "생성 중…" : "만들기"}
        </button>
      </div>
    </div>
  );
}
