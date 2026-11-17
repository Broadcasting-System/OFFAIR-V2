"use client";

/**
 * 화면용 확장 목록 — lib/editor/schema.ts 의 노드에 React 노드 뷰를 덧입히고,
 * 자리표시 글·`/` 블록 메뉴·추가 단축키를 붙인다.
 */
import { Extension, type AnyExtension, type Editor, type Range } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import {
  Callout,
  Steps,
  Step,
  Figure,
  CardGrid,
  Card,
  Youtube,
  RawBlock,
  RawInline,
  WikiCodeBlock,
  wikiExtensions,
} from "@/lib/editor/schema";
import {
  CalloutView,
  StepsView,
  StepView,
  FigureView,
  CardGridView,
  CardView,
  YoutubeView,
  RawBlockView,
  RawInlineView,
  CodeBlockView,
} from "./nodes";

/* ───────────── `/` 블록 메뉴 상태 (React 와 잇는 작은 저장소) ───────────── */

export interface SlashItem {
  key: string;
  name: string;
  group: string;
  icon: string;
  kbd?: string;
  /** 검색어 (한글·영어 별칭) */
  aliases: string[];
  run: (editor: Editor) => void;
}

export interface SlashState {
  open: boolean;
  items: SlashItem[];
  active: number;
  rect: DOMRect | null;
  range: Range | null;
  query: string;
}

type Listener = () => void;

export class SlashStore {
  state: SlashState = { open: false, items: [], active: 0, rect: null, range: null, query: "" };
  private listeners = new Set<Listener>();
  private command: ((item: SlashItem) => void) | null = null;
  private provider: () => SlashItem[] = () => [];
  private spinListeners = new Set<(k: "undo" | "redo") => void>();
  /** 메뉴 항목을 만드는 함수 (편집기 화면이 넘겨준다) */
  provide(fn: () => SlashItem[]) {
    this.provider = fn;
  }
  items(): SlashItem[] {
    return this.provider();
  }
  /** ⌘Z 를 눌렀을 때 도구 막대 아이콘을 돌리라고 알린다 */
  emitSpin(k: "undo" | "redo") {
    this.spinListeners.forEach((l) => l(k));
  }
  onSpin(l: (k: "undo" | "redo") => void) {
    this.spinListeners.add(l);
    return () => {
      this.spinListeners.delete(l);
    };
  }
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  get = () => this.state;
  private set(patch: Partial<SlashState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  show(p: SuggestionProps<SlashItem, SlashItem>) {
    this.command = p.command;
    const keep = this.state.open && this.state.query === p.query ? this.state.active : 0;
    this.set({ open: true, items: p.items, active: Math.min(keep, Math.max(0, p.items.length - 1)), rect: p.clientRect?.() ?? null, range: p.range, query: p.query });
  }
  hide() {
    this.command = null;
    if (this.state.open) this.set({ open: false });
  }
  setActive(i: number) {
    this.set({ active: i });
  }
  pick(item: SlashItem) {
    this.command?.(item);
  }
  key(e: KeyboardEvent): boolean {
    const { open, items, active } = this.state;
    if (!open) return false;
    if (e.key === "ArrowDown") {
      this.set({ active: items.length ? (active + 1) % items.length : 0 });
      return true;
    }
    if (e.key === "ArrowUp") {
      this.set({ active: items.length ? (active - 1 + items.length) % items.length : 0 });
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      const it = items[active];
      if (it) this.pick(it);
      return Boolean(it);
    }
    if (e.key === "Escape") {
      this.hide();
      return true;
    }
    return false;
  }
}

export function filterSlash(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => [it.name, ...it.aliases].some((a) => a.toLowerCase().includes(q)));
}

const slashKey = new PluginKey("wikiSlash");

const SlashCommand = Extension.create<{ store: SlashStore | null }>({
  name: "wikiSlash",
  // 메뉴가 열려 있을 때 Enter·화살표를 다른 단축키보다 먼저 받는다
  priority: 1000,
  addOptions() {
    return { store: null };
  },
  addProseMirrorPlugins() {
    const store = this.options.store;
    if (!store) return [];
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: slashKey,
        char: "/",
        allowSpaces: false,
        allowedPrefixes: [" ", " "],
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return $from.parent.type.name !== "codeBlock" && !$from.parent.type.spec.code;
        },
        items: ({ query }) => filterSlash(store.items(), query).slice(0, 30),
        command: ({ editor, range, props }) => {
          editor.chain().focus(undefined, { scrollIntoView: false }).deleteRange(range).run();
          props.run(editor);
        },
        render: () => ({
          onStart: (p) => store.show(p),
          onUpdate: (p) => store.show(p),
          onExit: () => store.hide(),
          onKeyDown: (p: SuggestionKeyDownProps) => store.key(p.event),
        }),
      }),
    ];
  },
});

/* ───────────── 단축키 덧붙이기 ───────────── */

const WikiKeys = Extension.create<{ onLink: () => void; onUndoRedo: (kind: "undo" | "redo") => void }>({
  name: "wikiKeys",
  priority: 1000,
  addOptions() {
    return { onLink: () => {}, onUndoRedo: () => {} };
  },
  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        this.options.onLink();
        return true;
      },
      // 실행 취소 아이콘 회전만 알리고, 실제 실행 취소는 기본 단축키가 한다
      "Mod-z": () => {
        this.options.onUndoRedo("undo");
        return false;
      },
      "Shift-Mod-z": () => {
        this.options.onUndoRedo("redo");
        return false;
      },
      "Mod-y": () => {
        this.options.onUndoRedo("redo");
        return false;
      },
    };
  },
});

/* ───────────── 모음 ───────────── */

export function editorExtensions(opts: {
  slash: SlashStore;
  onLink: () => void;
  onUndoRedo: (kind: "undo" | "redo") => void;
}): AnyExtension[] {
  const views: Record<string, AnyExtension> = {
    callout: Callout.extend({ addNodeView: () => ReactNodeViewRenderer(CalloutView) }),
    steps: Steps.extend({ addNodeView: () => ReactNodeViewRenderer(StepsView) }),
    step: Step.extend({ addNodeView: () => ReactNodeViewRenderer(StepView) }),
    figure: Figure.extend({ addNodeView: () => ReactNodeViewRenderer(FigureView) }),
    cardGrid: CardGrid.extend({ addNodeView: () => ReactNodeViewRenderer(CardGridView) }),
    card: Card.extend({ addNodeView: () => ReactNodeViewRenderer(CardView) }),
    youtube: Youtube.extend({ addNodeView: () => ReactNodeViewRenderer(YoutubeView) }),
    rawBlock: RawBlock.extend({ addNodeView: () => ReactNodeViewRenderer(RawBlockView) }),
    rawInline: RawInline.extend({ addNodeView: () => ReactNodeViewRenderer(RawInlineView, { as: "span" }) }),
    codeBlock: WikiCodeBlock.extend({ addNodeView: () => ReactNodeViewRenderer(CodeBlockView) }),
  };
  return [
    ...wikiExtensions(views),
    Placeholder.configure({
      includeChildren: true,
      showOnlyCurrent: true,
      placeholder: ({ editor, node, pos }) => {
        if (node.type.name === "heading") return "제목";
        if (node.type.name !== "paragraph") return "";
        const parent = editor.state.doc.resolve(pos).parent.type.name;
        if (parent === "callout") return "상자 안 내용을 적으세요";
        if (parent === "step") return "이 단계에서 할 일을 적으세요";
        if (parent === "card") return "카드 설명 (선택)";
        if (parent === "listItem" || parent === "taskItem") return "";
        return "글을 적거나 ‘/’ 로 블록 넣기";
      },
    }),
    SlashCommand.configure({ store: opts.slash }),
    WikiKeys.configure({ onLink: opts.onLink, onUndoRedo: opts.onUndoRedo }),
  ];
}
