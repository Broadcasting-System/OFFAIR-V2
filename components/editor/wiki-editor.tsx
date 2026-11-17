"use client";

/**
 * OFFAIR 위키 편집기 — 승인 시안 "편집기 시안 A"
 * (아래 떠 있는 피그마식 도구 막대 + 글자 선택 메뉴).
 *
 * 위: 경로 · "편집 중" · 초안 자동 저장 상태 · 취소 · 게시
 * 가운데: 제목/설명 칸(왼쪽 이름표) + 본문(Tiptap)
 * 아래: 도구 막대, 글자를 고르면 서식 메뉴, `/`·빈 줄 `+` 로 블록 메뉴
 *
 * 저장: lib/editor/wiki-client.ts (위키 API). 초안은 localStorage.
 * 그림·파일·영상 넣기: 넣기 창(MediaInsertDialog) — 내 컴퓨터에서 / 올린 파일에서 / 주소로, 넣기 전 표시 달기.
 * 댓글 모드: 고른 글에 댓글 (onComment) — 읽기 화면 여백 카드로 보인다.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { mdxToDoc, bodyToDoc } from "@/lib/editor/mdx-to-doc";
import { docToMdx } from "@/lib/editor/doc-to-mdx";
import type { DocMetaFields } from "@/lib/editor/frontmatter";
import { wikiClient } from "@/lib/editor/wiki-client";
import { clearDraft, hhmm, loadDraft, saveDraft } from "@/lib/editor/draft";
import { docHref, type SpaceKey } from "@/lib/wiki/links";
import { emitTreeChanged } from "@/lib/wiki/client";
import { ImageAnnotator, MediaInsertDialog, type AnnotatorResult, type MediaTab } from "@/components/media";
import { defaultMediaClient, loadSidecar, uploadAnnotated } from "@/lib/media/client";
import type { AnnotationSidecar } from "@/lib/media/annotate/types";
import type { MediaItem } from "@/lib/media/types";
import { youTubeWatchUrl } from "@/lib/media/url";
import { editorExtensions, SlashStore, type SlashItem } from "./extensions";
import { Toolbar, type BlockKind, type ListKind, type ToolbarHandle, type ToolbarState } from "./toolbar";
import { BubbleMenu } from "./bubble-menu";
import { SlashMenu } from "./slash-menu";
import { EditorUiContext, type AnnotatedFigure, type EditorUi } from "./context";
import { Icon } from "./icons";
import { DarkMenu } from "./dark-menu";
import { blocksFor, currentBlock, insertBlocks, isUrl, reveal, youtubeId } from "./insert";
import { baseName, prepareImage } from "./upload";
import "./editor.css";

export interface CommentTarget {
  from: number;
  to: number;
  /** 고른 글의 DOM 범위와 본문 요소 — 읽기 화면에서 같은 글을 다시 찾을 자리(anchor)를 만든다 */
  range: Range | null;
  root: HTMLElement | null;
}

export interface WikiEditorProps {
  space: string;
  /** 문서 경로(확장자 없이). 새 문서면 null — 게시할 때 제목으로 정한다 */
  path: string | null;
  initialMdx: string;
  initialRev: string | null;
  /** 위 막대 경로 (예: ["가이드북", "ONAIR 원격 제어"]) — 끝에 제목이 붙는다 */
  crumbs: string[];
  /** 취소·게시 뒤 돌아갈 주소 */
  returnUrl: string;
  /** 다른 문서 링크 고르기 목록 */
  docs: { title: string; url: string; category: string }[];
  /** 분류 고르기 (새 문서) */
  categories?: string[];
  readOnly?: boolean;
  /** 댓글 모드로 고른 글 + 쓴 말. 주면 편집기가 먼저 댓글 입력 줄을 띄운다 */
  onComment?: (target: CommentTarget, quote: string, body: string) => Promise<void> | void;
}

interface Notice {
  kind: "draft" | "conflict" | "error" | "info";
  text: string;
  actions?: { label: string; primary?: boolean; run: () => void }[];
}

interface PromptState {
  label: string;
  placeholder: string;
  icon: string;
  initial?: string;
  suggestions?: { key: string; name: string; desc?: string }[];
  onSubmit: (value: string, pickedKey?: string) => void;
}

interface PasteChoice {
  from: number;
  to: number;
  url: string;
  youtube: boolean;
  left: number;
  top: number;
}

const DRAFT_EVERY_MS = 3000;

export function WikiEditor(props: WikiEditorProps) {
  const { space, initialMdx, initialRev, crumbs, returnUrl, docs, readOnly = false } = props;
  const router = useRouter();

  /* ── 처음 문서 ── */
  const parsed = useMemo(() => mdxToDoc(initialMdx), [initialMdx]);
  const [meta, setMeta] = useState<DocMetaFields>(parsed.meta);
  const metaRef = useRef(meta);
  useLayoutEffect(() => {
    metaRef.current = meta;
  }, [meta]);
  const [path, setPath] = useState<string | null>(props.path);
  const [rev, setRev] = useState<string | null>(initialRev);
  /** 게시본을 지금 규칙으로 다시 쓴 글 — '바뀐 게 있나' 비교 기준 (정리만으로는 바뀐 걸로 치지 않는다) */
  const baseline = useRef<string>(docToMdx(parsed));

  /* ── 화면 상태 ── */
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [linkRequest, setLinkRequest] = useState(0);
  const [pasteChoice, setPasteChoice] = useState<PasteChoice | null>(null);
  const [plusPos, setPlusPos] = useState<{ left: number; top: number } | null>(null);
  const [ghost, setGhost] = useState<{ left: number; top: number } | null>(null);
  const [unfoldKey] = useState(() => `${props.path ?? "new"}:${Date.now()}`);
  /** 넣기 창 — resolve 가 있으면 그림 하나를 골라 돌려준다(그림 바꾸기) */
  const [media, setMedia] = useState<{ tab: MediaTab; single?: (item: MediaItem | null) => void } | null>(null);
  /** 표시 달기 창 (그림 블록에서 연다) */
  const [annot, setAnnot] = useState<{ src: string; name: string; initial?: AnnotationSidecar; done: (r: AnnotatedFigure | null) => void } | null>(null);

  const workRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<ToolbarHandle>(null);
  const slash = useMemo(() => new SlashStore(), []);
  const editorRef = useRef<Editor | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  /* ── 파일 올리기 ── */
  const uploadImage = useCallback<EditorUi["uploadImage"]>(
    async (file) => {
      say("이미지 올리는 중…");
      try {
        const prepared = await prepareImage(file);
        const { url } = await wikiClient.uploadFile(space, prepared.file, path);
        setToast(null);
        return { url, width: prepared.width, height: prepared.height };
      } catch (e) {
        say(`올리지 못했어요 — ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    },
    [space, say, path],
  );

  /* ── 넣기 창 · 표시 달기 (그림 블록도 쓴다) ── */
  const pickImage = useCallback<NonNullable<EditorUi["pickImage"]>>(
    () =>
      new Promise((resolve) =>
        setMedia({
          tab: "upload",
          single: (it) =>
            resolve(
              it && it.kind === "image"
                ? { src: it.url, alt: it.alt ?? it.name.replace(/\.[^.]+$/, ""), caption: it.caption ?? null, sidecar: it.sidecarUrl ?? null, width: it.width ?? null, height: it.height ?? null }
                : null,
            ),
        }),
      ),
    [],
  );
  const annotate = useCallback<NonNullable<EditorUi["annotate"]>>(
    async ({ src, sidecar, name }) => {
      let initial: AnnotationSidecar | undefined;
      if (sidecar) {
        try {
          const sc = await loadSidecar(sidecar);
          if (sc.base) initial = sc;
        } catch {
          say("달아 둔 표시를 못 불러왔어요 — 그림 위에 새로 달아요");
        }
      }
      return new Promise((resolve) => setAnnot({ src: initial?.base ?? src, name, initial, done: resolve }));
    },
    [say],
  );
  const ui = useMemo<EditorUi>(() => ({ uploadImage, toast: say, pickImage, annotate }), [uploadImage, say, pickImage, annotate]);

  /* ── 블록 넣기 공용 ── */
  const put = useCallback((content: JSONContent | JSONContent[]) => {
    const editor = editorRef.current;
    if (!editor) return;
    const at = insertBlocks(editor, content);
    if (at == null) say("여기에는 넣을 수 없어요");
    reveal(editor, at, scrollRef.current, toolbarRef.current?.el ?? null);
  }, [say]);

  const insertImageFiles = useCallback(
    async (files: File[]) => {
      for (const f of files) {
        const up = await uploadImage(f);
        if (up) put(blocksFor.figure(up.url, baseName(f.name), up.width, up.height));
      }
    },
    [uploadImage, put],
  );

  const ask = useCallback((p: PromptState) => setPrompt(p), []);

  const actions = useMemo(() => {
    const ed = () => editorRef.current!;
    const chain = () => ed().chain().focus(undefined, { scrollIntoView: false });
    return {
      setBlock(k: BlockKind) {
        if (k === "p") chain().setParagraph().run();
        else chain().setHeading({ level: Number(k[1]) as 1 | 2 | 3 }).run();
      },
      toggleList(k: ListKind) {
        if (k === "bullet") chain().toggleBulletList().run();
        else if (k === "number") chain().toggleOrderedList().run();
        else chain().toggleTaskList().run();
      },
      insertBox(k: string) {
        put(blocksFor.callout(k));
      },
      insertTable(r: number, c: number, h: boolean) {
        put(blocksFor.table(r, c, h));
      },
      tableOp(op: string) {
        const c = chain();
        const map: Record<string, () => boolean> = {
          rowBefore: () => c.addRowBefore().run(),
          rowAfter: () => c.addRowAfter().run(),
          colBefore: () => c.addColumnBefore().run(),
          colAfter: () => c.addColumnAfter().run(),
          delRow: () => c.deleteRow().run(),
          delCol: () => c.deleteColumn().run(),
          delTable: () => c.deleteTable().run(),
        };
        map[op]?.();
      },
      insertImage(how: "file" | "library" | "url") {
        setMedia({ tab: how === "library" ? "library" : how === "url" ? "url" : "upload" });
      },
      insertSteps() {
        put(blocksFor.steps());
      },
      async more(key: string) {
        switch (key) {
          case "code":
            return put(blocksFor.codeBlock());
          case "quote":
            return put(blocksFor.quote());
          case "hr":
            return put(blocksFor.hr());
          case "cards":
            return put(blocksFor.cardGrid());
          case "raw":
            return put(blocksFor.raw("<Component />"));
          case "file":
            setMedia({ tab: "upload" });
            return;
          case "youtube":
            return ask({
              label: "유튜브 주소",
              icon: "video",
              placeholder: "https://youtu.be/…",
              onSubmit: (v) => {
                if (!youtubeId(v)) return say("유튜브 주소가 아니에요");
                put(blocksFor.youtube(v.trim()));
              },
            });
          case "linkcard":
            return ask({
              label: "링크 카드 주소",
              icon: "link",
              placeholder: "https://… 또는 /docs/…",
              onSubmit: (v) => v && put(blocksFor.cardGrid(v.trim(), titleFromUrl(v))),
            });
          case "doclink":
            return ask({
              label: "다른 문서",
              icon: "page",
              placeholder: "문서 제목으로 찾기",
              suggestions: docs.map((d) => ({ key: d.url, name: d.title, desc: d.category })),
              onSubmit: (_v, picked) => {
                const d = docs.find((x) => x.url === picked);
                if (!d) return;
                chain()
                  .insertContent([
                    { type: "text", text: d.title, marks: [{ type: "link", attrs: { href: d.url } }] },
                    { type: "text", text: " " },
                  ])
                  .run();
              },
            });
        }
      },
    };
  }, [put, ask, docs, say]);

  /* ── `/` 메뉴 항목 ── */
  const slashItems = useCallback((): SlashItem[] => {
    const A = actions;
    const item = (key: string, name: string, group: string, icon: string, aliases: string[], run: () => void, kbd?: string): SlashItem => ({
      key, name, group, icon, aliases, kbd, run: () => run(),
    });
    return [
      item("p", "본문", "기본 블록", "text", ["text", "paragraph", "글"], () => A.setBlock("p"), "⌥⌘0"),
      item("h1", "큰 제목", "기본 블록", "h1", ["h1", "heading", "제목"], () => A.setBlock("h1"), "#"),
      item("h2", "중간 제목", "기본 블록", "h2", ["h2", "heading", "제목"], () => A.setBlock("h2"), "##"),
      item("h3", "작은 제목", "기본 블록", "h3", ["h3", "heading", "제목"], () => A.setBlock("h3"), "###"),
      item("bullet", "글머리 기호", "기본 블록", "bullet", ["list", "ul", "목록"], () => A.toggleList("bullet"), "-"),
      item("number", "번호 목록", "기본 블록", "number", ["ol", "number", "목록"], () => A.toggleList("number"), "1."),
      item("todo", "할 일 목록", "기본 블록", "todo", ["todo", "task", "체크"], () => A.toggleList("todo"), "[ ]"),
      item("table", "표", "기본 블록", "table", ["table", "표"], () => A.insertTable(3, 3, true)),
      item("image", "이미지", "기본 블록", "image", ["image", "img", "그림", "사진"], () => A.insertImage("file")),
      item("code", "코드 블록", "기본 블록", "code", ["code", "코드"], () => void A.more("code"), "```"),
      item("quote", "인용", "기본 블록", "quote", ["quote", "blockquote"], () => void A.more("quote"), ">"),
      item("hr", "구분선", "기본 블록", "hr", ["hr", "divider", "선"], () => void A.more("hr"), "---"),
      item("steps", "단계", "가이드 블록", "steps", ["steps", "step", "절차", "순서"], () => A.insertSteps()),
      item("warn", "주의 상자", "가이드 블록", "warn", ["callout", "warn", "강조", "상자"], () => A.insertBox("warn")),
      item("info", "정보 상자", "가이드 블록", "info", ["callout", "info", "강조", "상자"], () => A.insertBox("info")),
      item("tip", "팁 상자", "가이드 블록", "tip", ["callout", "tip", "강조", "상자"], () => A.insertBox("tip")),
      item("note", "메모 상자", "가이드 블록", "note", ["callout", "note", "강조문", "상자"], () => A.insertBox("note")),
      item("danger", "경고 상자", "가이드 블록", "danger", ["callout", "danger", "강조", "상자"], () => A.insertBox("danger")),
      item("cards", "카드 묶음", "가이드 블록", "card", ["card", "카드", "링크"], () => void A.more("cards")),
      item("file", "파일", "첨부·링크", "file", ["file", "첨부", "upload"], () => void A.more("file")),
      item("youtube", "유튜브", "첨부·링크", "video", ["youtube", "video", "영상"], () => void A.more("youtube")),
      item("linkcard", "링크 카드", "첨부·링크", "link", ["link", "card", "url"], () => void A.more("linkcard")),
      item("doclink", "다른 문서 링크", "첨부·링크", "page", ["doc", "page", "문서", "링크"], () => void A.more("doclink")),
      item("raw", "원문 블록 (MDX)", "고급", "raw", ["mdx", "jsx", "raw", "원문"], () => void A.more("raw")),
    ];
  }, [actions]);
  useLayoutEffect(() => {
    slash.provide(slashItems);
  }, [slash, slashItems]);

  /* ── 편집기 ── */
  const extensions = useMemo(
    () =>
      editorExtensions({
        slash,
        onLink: () => setLinkRequest((n) => n + 1),
        onUndoRedo: (k) => slash.emitSpin(k),
      }),
    [slash],
  );

  const handlePaste = useCallback(
    (view: EditorView, event: ClipboardEvent): boolean => {
      const editor = editorRef.current;
      if (!editor) return false;
      const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        event.preventDefault();
        void insertImageFiles(files);
        return true;
      }
      if (view.state.selection.$from.parent.type.spec.code) return false;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      const html = event.clipboardData?.getData("text/html") ?? "";
      if (isUrl(text)) {
        const url = text.trim();
        const sel = view.state.selection;
        if (!sel.empty) {
          editor.chain().setLink({ href: url }).run();
          return true;
        }
        const from = sel.from;
        editor.chain().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] }).run();
        const to = from + url.length;
        const c = view.coordsAtPos(to);
        const pr = paperRef.current?.getBoundingClientRect();
        if (pr) setPasteChoice({ from, to, url, youtube: Boolean(youtubeId(url)), left: c.left - pr.left, top: c.bottom - pr.top + 6 });
        return true;
      }
      if (!html && looksLikeMarkdown(text)) {
        try {
          const doc = bodyToDoc(text, { mdx: false });
          editor.chain().insertContent(doc.content ?? []).run();
          return true;
        } catch {
          return false;
        }
      }
      return false;
    },
    [insertImageFiles],
  );

  const handleDrop = useCallback(
    (view: EditorView, event: DragEvent, _slice: unknown, moved: boolean): boolean => {
      if (moved) return false;
      const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return false;
      event.preventDefault();
      const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (hit) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(hit.pos))));
      void insertImageFiles(files);
      return true;
    },
    [insertImageFiles],
  );

  const editor = useEditor({
    extensions,
    content: parsed.doc,
    editable: !readOnly,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: "we-doc", spellcheck: "false", "aria-label": "본문" },
      scrollThreshold: { top: 24, bottom: 120, left: 0, right: 0 },
      scrollMargin: { top: 24, bottom: 120, left: 0, right: 0 },
      handlePaste: (view, event) => handlePaste(view, event),
      handleDrop: (view, event, slice, moved) => handleDrop(view, event, slice, moved),
    },
  });
  useLayoutEffect(() => {
    editorRef.current = editor;
  }, [editor]);
  useEffect(() => slash.onSpin((k) => toolbarRef.current?.spin(k)), [slash]);

  /* ── 도구 막대 상태 ── */
  const tbState = useEditorState<ToolbarState>({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return { block: "p", canUndo: false, canRedo: false, inTable: false, activeList: null, commentMode: false };
      const parent = e.state.selection.$from.parent;
      const level = parent.attrs.level as number | undefined;
      const block: BlockKind | null =
        parent.type.name === "heading" ? (level && level <= 3 ? (`h${level}` as BlockKind) : null) : parent.type.name === "paragraph" ? "p" : null;
      return {
        block,
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        inTable: e.isActive("table"),
        activeList: e.isActive("taskList") ? "todo" : e.isActive("orderedList") ? "number" : e.isActive("bulletList") ? "bullet" : null,
        commentMode: false,
      };
    },
  }) ?? { block: "p", canUndo: false, canRedo: false, inTable: false, activeList: null, commentMode: false };

  /* ── 바뀐 것 살피기 · 초안 자동 저장 ── */
  const serialize = useCallback(() => {
    const e = editorRef.current;
    if (!e) return baseline.current;
    return docToMdx({ meta: metaRef.current, doc: e.getJSON() });
  }, []);

  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyPath = path ?? "new";

  const writeDraft = useCallback(() => {
    if (readOnly) return;
    const mdx = serialize();
    if (mdx === baseline.current) return;
    const at = Date.now();
    if (saveDraft(space, keyPath, { mdx, baseRev: rev, savedAt: at })) setStatus(`초안 자동 저장됨 · ${hhmm(at)}`);
  }, [serialize, space, keyPath, rev, readOnly]);

  const onChange = useCallback(() => {
    if (dirtyTimer.current) clearTimeout(dirtyTimer.current);
    dirtyTimer.current = setTimeout(() => setDirty(serialize() !== baseline.current), 250);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(writeDraft, DRAFT_EVERY_MS);
  }, [serialize, writeDraft]);

  useEffect(() => {
    if (!editor) return;
    editor.on("update", onChange);
    editor.on("blur", writeDraft);
    return () => {
      editor.off("update", onChange);
      editor.off("blur", writeDraft);
    };
  }, [editor, onChange, writeDraft]);

  // 제목·설명이 바뀌어도
  const firstMeta = useRef(true);
  useEffect(() => {
    if (firstMeta.current) {
      firstMeta.current = false;
      return;
    }
    onChange();
  }, [meta, onChange]);

  // 창을 떠날 때·다른 탭으로 갈 때도 초안 저장
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && writeDraft();
    window.addEventListener("blur", writeDraft);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("blur", writeDraft);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [writeDraft]);

  // 게시 안 한 변경이 있으면 떠나기 전에 묻기
  useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      writeDraft();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty, writeDraft]);

  /* ── 남은 초안 확인 ── */
  const loadMdx = useCallback((mdx: string) => {
    const e = editorRef.current;
    if (!e) return;
    const p = mdxToDoc(mdx);
    setMeta(p.meta);
    metaRef.current = p.meta;
    e.commands.setContent(p.doc, { emitUpdate: true });
  }, []);

  const draftChecked = useRef(false);
  useEffect(() => {
    if (!editor || draftChecked.current || readOnly) return;
    draftChecked.current = true;
    const d = loadDraft(space, keyPath);
    if (!d || d.mdx === baseline.current) return;
    const moved = d.baseRev !== initialRev;
    setNotice({
      kind: "draft",
      text: `게시하지 않은 초안이 있어요 (${hhmm(d.savedAt)})${moved ? " — 그 사이 게시본이 바뀌었어요. 불러온 뒤 확인하세요." : ""}`,
      actions: [
        {
          label: "초안 불러오기",
          primary: true,
          run: () => {
            loadMdx(d.mdx);
            setStatus(`초안 불러옴 · ${hhmm(d.savedAt)}`);
            setNotice(null);
          },
        },
        {
          label: "버리기",
          run: () => {
            clearDraft(space, keyPath);
            setNotice(null);
          },
        },
      ],
    });
  }, [editor, space, keyPath, initialRev, loadMdx, readOnly]);

  /* ── 게시 ── */
  const publishRef = useRef<((rev?: string | null) => Promise<void>) | null>(null);
  const publish = useCallback(
    async (overrideRev?: string | null) => {
      const e = editorRef.current;
      if (!e || publishing) return;
      if (!metaRef.current.title.trim()) {
        setNotice({ kind: "error", text: "제목을 적어 주세요." });
        return;
      }
      setPublishing(true);
      try {
        let target = path;
        if (!target) {
          target = wikiClient.suggestPath
            ? await wikiClient.suggestPath(space, metaRef.current.title)
            : `docs/${slugify(metaRef.current.title)}`;
          setPath(target);
        }
        const mdx = serialize();
        const r = await wikiClient.saveDoc(space, target, mdx, overrideRev === undefined ? rev : overrideRev);
        if (r.ok) {
          clearDraft(space, keyPath);
          if (keyPath !== target) clearDraft(space, target);
          baseline.current = mdx;
          setRev(r.rev);
          setDirty(false);
          setNotice(null);
          setStatus(`게시됨 · ${hhmm(Date.now())}`);
          // 제목·분류가 바뀌었을 수 있으니 서랍 트리도 다시 받는다
          emitTreeChanged({ space });
          const dest = props.path ? returnUrl : docHref(space as SpaceKey, target.split("/"));
          router.push(dest);
          router.refresh();
          return;
        }
        if (r.conflict) {
          writeDraft();
          const theirs = r.mdx;
          const theirRev = r.rev;
          setNotice({
            kind: "conflict",
            text: theirRev
              ? "편집하는 사이에 다른 사람이 이 문서를 먼저 게시했어요. 내 글은 초안으로 보관해 두었어요."
              : "같은 주소의 문서가 이미 있거나, 문서가 지워졌어요.",
            actions: [
              ...(theirRev
                ? [
                    {
                      label: "최신 게시본 불러오기",
                      run: () => {
                        baseline.current = docToMdx(mdxToDoc(theirs));
                        setRev(theirRev);
                        loadMdx(theirs);
                        setNotice({ kind: "info", text: "최신 게시본을 불러왔어요. 내 초안은 브라우저에 남아 있어요." });
                      },
                    },
                  ]
                : []),
              { label: "내 글로 덮어쓰기", primary: true, run: () => void publishRef.current?.(theirRev) },
            ],
          });
          return;
        }
        setNotice({ kind: "error", text: `게시하지 못했어요 — ${r.error}` });
      } catch (err) {
        setNotice({ kind: "error", text: `게시하지 못했어요 — ${err instanceof Error ? err.message : String(err)}` });
      } finally {
        setPublishing(false);
      }
    },
    [publishing, path, space, serialize, rev, keyPath, props, returnUrl, router, writeDraft, loadMdx],
  );

  useEffect(() => {
    publishRef.current = publish;
  }, [publish]);

  /* ── 취소 ── */
  const leave = useCallback(() => {
    setDirty(false);
    router.push(returnUrl);
  }, [router, returnUrl]);
  const cancel = useCallback(() => {
    if (serialize() !== baseline.current) setConfirmLeave(true);
    else leave();
  }, [serialize, leave]);

  /* ── 댓글 모드 ── */
  const onCommentProp = props.onComment;
  const emitComment = useCallback(
    (sel: { from: number; to: number }, text: string) => {
      const e = editorRef.current;
      if (!onCommentProp || !e) return say("이 문서에는 댓글을 달 수 없어요");
      // PM 위치 → DOM 범위 (읽기 화면 글과 같은 글자로 자리를 만든다)
      let range: Range | null = null;
      try {
        const a = e.view.domAtPos(sel.from);
        const b = e.view.domAtPos(sel.to);
        range = document.createRange();
        range.setStart(a.node, a.offset);
        range.setEnd(b.node, b.offset);
      } catch {
        range = null;
      }
      const quote = text.length > 24 ? text.slice(0, 24) + "…" : text;
      ask({
        label: "댓글",
        icon: "comment",
        placeholder: `“${quote}” 에 남길 말`,
        onSubmit: (body) => {
          if (!body) return;
          void Promise.resolve(onCommentProp({ ...sel, range, root: e.view.dom as HTMLElement }, text, body)).then(
            () => say("댓글을 남겼어요 — 읽기 화면 여백에 보여요"),
            (err) => say(`댓글을 남기지 못했어요 — ${err instanceof Error ? err.message : String(err)}`),
          );
        },
      });
    },
    [onCommentProp, say, ask],
  );

  /* ── 넣기 창에서 고른 것 넣기 ── */
  const insertMedia = useCallback(
    (items: MediaItem[]) => {
      const blocks: JSONContent[] = [];
      for (const it of items) {
        if (it.kind === "image") {
          const f = blocksFor.figure(it.url, it.alt ?? it.name.replace(/\.[^.]+$/, ""), it.width, it.height);
          f.attrs = { ...f.attrs, caption: it.caption || null, sidecar: it.sidecarUrl ?? null };
          blocks.push(f);
        } else if (it.kind === "youtube") {
          const url = it.videoId ? youTubeWatchUrl({ id: it.videoId, start: it.start }) : it.url;
          blocks.push({ type: "youtube", attrs: { url, title: it.name && !/^https?:/.test(it.name) ? it.name : "", start: it.start ?? null } });
        } else {
          blocks.push(blocksFor.linkParagraph(it.url, it.name));
        }
      }
      if (blocks.length) put(blocks);
    },
    [put],
  );

  const onAnnotated = useCallback(
    async (r: AnnotatorResult) => {
      const a = annot;
      if (!a) return;
      say("표시 단 그림 올리는 중…");
      try {
        const item = await uploadAnnotated(defaultMediaClient, space, r, { name: a.name, doc: path ?? undefined });
        setToast(null);
        setAnnot(null);
        a.done({ src: item.url, sidecar: item.sidecarUrl ?? null, caption: item.caption ?? null, width: item.width ?? null, height: item.height ?? null });
      } catch (e) {
        say(`올리지 못했어요 — ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [annot, say, space, path],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (prompt) return;
        if (commentMode) {
          setCommentMode(false);
          return;
        }
        if (pasteChoice) setPasteChoice(null);
      }
      const t = document.activeElement;
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "c" && (t === document.body || t === null) && !readOnly) {
        setCommentMode((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [commentMode, pasteChoice, prompt, readOnly]);

  useEffect(() => {
    if (!editor || !commentMode) return;
    const dom = editor.view.dom;
    const onUp = () => {
      setTimeout(() => {
        const { state } = editor;
        let { from, to } = state.selection;
        if (from === to) {
          const w = wordAt(state.doc, from);
          from = w.from;
          to = w.to;
        }
        if (from !== to) {
          editor.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
          emitComment({ from, to }, state.doc.textBetween(from, to, " "));
        }
        setCommentMode(false); // 만든 뒤에는 보통 도구로 돌아온다
      }, 0);
    };
    dom.addEventListener("mouseup", onUp);
    return () => dom.removeEventListener("mouseup", onUp);
  }, [editor, commentMode, emitComment]);

  /* ── 빈 줄의 + 버튼 · 붙여넣은 주소 고르기 정리 ── */
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const { state, view } = editor;
      const sel = state.selection;
      const ctx = currentBlock(state);
      const show =
        editor.isEditable && view.hasFocus() && sel.empty && ctx.empty && !slash.get().open && sel.$from.parent.type.name === "paragraph";
      if (!show || !paperRef.current) return setPlusPos(null);
      const c = view.coordsAtPos(sel.from);
      const pr = paperRef.current.getBoundingClientRect();
      setPlusPos({ left: Math.max(0, c.left - pr.left - 34), top: c.top - pr.top + (c.bottom - c.top) / 2 - 13 });
    };
    const onTr = () => update();
    const onBlur = () => setTimeout(update, 0);
    editor.on("selectionUpdate", update);
    editor.on("focus", update);
    editor.on("blur", onBlur);
    editor.on("transaction", onTr);
    const unsub = slash.subscribe(update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("focus", update);
      editor.off("blur", onBlur);
      editor.off("transaction", onTr);
      unsub();
    };
  }, [editor, slash]);

  // 붙여넣은 주소 고르기는 커서가 그 링크를 떠나면 닫는다
  useEffect(() => {
    if (!editor || !pasteChoice) return;
    const check = () => {
      const { from } = editor.state.selection;
      if (from < pasteChoice.from || from > pasteChoice.to + 1) setPasteChoice(null);
    };
    editor.on("selectionUpdate", check);
    return () => {
      editor.off("selectionUpdate", check);
    };
  }, [editor, pasteChoice]);

  const choosePaste = (kind: "link" | "card" | "youtube") => {
    const e = editorRef.current;
    const p = pasteChoice;
    setPasteChoice(null);
    if (!e || !p || kind === "link") return;
    e.chain().focus(undefined, { scrollIntoView: false }).deleteRange({ from: p.from, to: p.to }).run();
    put(kind === "card" ? blocksFor.cardGrid(p.url, titleFromUrl(p.url)) : blocksFor.youtube(p.url));
  };

  /* ── 페이지 스크롤 잠금 (편집기가 화면을 다 쓴다) ── */
  useEffect(() => {
    document.documentElement.classList.add("we-lock");
    return () => document.documentElement.classList.remove("we-lock");
  }, []);

  /* ── 그리기 ── */
  const title = meta.title || "제목 없음";
  const tb: ToolbarState = { ...tbState, commentMode };

  return (
    <EditorUiContext.Provider value={ui}>
      <div className={`wiki-editor${commentMode ? " is-commenting" : ""}${readOnly ? " is-readonly" : ""}`}>
        <header className="we-top">
          <nav className="we-crumb" aria-label="경로">
            {[...crumbs, title].map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="we-crumb-sep"> › </span>}
                {c}
              </span>
            ))}
          </nav>
          {!readOnly && <span className="we-badge">편집 중</span>}
          <span className="we-saved" aria-live="polite">
            {publishing ? "게시하는 중…" : status}
          </span>
          <button type="button" className="we-btn" onClick={cancel}>
            취소
          </button>
          {!readOnly && (
            <button type="button" className="we-btn we-btn--pri" onClick={() => void publish()} disabled={publishing}>
              게시
            </button>
          )}
        </header>

        <div
          className="we-work"
          ref={workRef}
          onMouseMove={(e) => {
            if (!commentMode) return;
            const inDoc = (e.target as HTMLElement).closest(".we-doc");
            const wr = workRef.current?.getBoundingClientRect();
            if (!inDoc || !wr) return setGhost(null);
            setGhost({ left: e.clientX - wr.left + 14, top: e.clientY - wr.top + 14 });
          }}
          onMouseLeave={() => setGhost(null)}
        >
          <div className="we-scroll" ref={scrollRef}>
            {notice && (
              <div className={`we-notice we-notice--${notice.kind}`} role={notice.kind === "error" || notice.kind === "conflict" ? "alert" : "status"}>
                <span>{notice.text}</span>
                <span className="we-notice-acts">
                  {notice.actions?.map((a) => (
                    <button key={a.label} type="button" className={`we-btn we-btn--sm${a.primary ? " we-btn--pri" : ""}`} onClick={a.run}>
                      {a.label}
                    </button>
                  ))}
                  <button type="button" className="we-notice-x" aria-label="알림 닫기" onClick={() => setNotice(null)}>
                    <Icon name="close" size={14} />
                  </button>
                </span>
              </div>
            )}
            <div className="we-paper" ref={paperRef}>
              <div className="we-head">
                <label htmlFor="we-title">제목</label>
                <TitleInput
                  id="we-title"
                  className="we-title"
                  value={meta.title}
                  placeholder="제목 없음"
                  readOnly={readOnly}
                  onChange={(v) => setMeta((m) => ({ ...m, title: v }))}
                  onEnter={() => document.getElementById("we-desc")?.focus()}
                />
                <label htmlFor="we-desc" className="we-head-sub">
                  설명
                </label>
                <TitleInput
                  id="we-desc"
                  className="we-desc"
                  value={meta.description}
                  placeholder="한 줄 설명 (사이드바·검색에 보여요)"
                  readOnly={readOnly}
                  onChange={(v) => setMeta((m) => ({ ...m, description: v }))}
                  onEnter={() => editorRef.current?.chain().focus("start", { scrollIntoView: false }).run()}
                />
                {!props.path && (
                  <>
                    <label htmlFor="we-cat" className="we-head-sub">
                      분류
                    </label>
                    <input
                      id="we-cat"
                      className="we-desc we-cat"
                      list="we-cat-list"
                      value={meta.category}
                      placeholder="사이드바 묶음 (예: ONAIR 원격 제어)"
                      onChange={(e) => setMeta((m) => ({ ...m, category: e.target.value }))}
                    />
                    <datalist id="we-cat-list">
                      {(props.categories ?? []).map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </>
                )}
              </div>

              <div className="we-body">{editor && <EditorContent editor={editor} />}</div>

              {editor && !readOnly && (
                <>
                  <BubbleMenu editor={editor} paper={paperRef} commentMode={commentMode || Boolean(pasteChoice)} onComment={emitComment} linkRequest={linkRequest} />
                  <SlashMenu store={slash} paper={paperRef} />
                  {plusPos && !commentMode && (
                    <button
                      type="button"
                      className="we-plus"
                      style={{ left: plusPos.left, top: plusPos.top }}
                      aria-label="블록 넣기"
                      title="블록 넣기  /"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).insertContent("/").run()}
                    >
                      <Icon name="add" size={16} />
                    </button>
                  )}
                  {pasteChoice && (
                    <div className="we-paste" style={{ left: pasteChoice.left, top: pasteChoice.top }} onMouseDown={(e) => e.preventDefault()}>
                      <button type="button" className="on" onClick={() => choosePaste("link")}>
                        <Icon name="link" size={14} /> 링크
                      </button>
                      <button type="button" onClick={() => choosePaste("card")}>
                        <Icon name="card" size={14} /> 링크 카드
                      </button>
                      {pasteChoice.youtube && (
                        <button type="button" onClick={() => choosePaste("youtube")}>
                          <Icon name="video" size={14} /> 영상으로
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {ghost && commentMode && <div className="we-ghost" style={{ left: ghost.left, top: ghost.top }} />}
          {commentMode && (
            <div className="we-hint" role="status">
              <Icon name="comment" size={15} /> 댓글을 달 글을 누르거나 끌어서 고르세요 <kbd>Esc 취소</kbd>
            </div>
          )}
          {toast && (
            <div className="we-toast" role="status">
              {toast}
            </div>
          )}
          {prompt && <PromptBar prompt={prompt} onClose={() => { setPrompt(null); editorRef.current?.commands.focus(undefined, { scrollIntoView: false }); }} />}

          <MediaInsertDialog
            open={media !== null}
            space={space}
            doc={path ?? undefined}
            initialTab={media?.tab}
            multiple={!media?.single}
            onClose={() => {
              media?.single?.(null);
              setMedia(null);
            }}
            onInsert={(items) => {
              const m = media;
              setMedia(null);
              if (m?.single) m.single(items[0] ?? null);
              else insertMedia(items);
            }}
          />
          {annot && (
            <ImageAnnotator
              key={annot.src}
              src={annot.src}
              name={annot.name}
              initial={annot.initial}
              doneLabel={annot.initial ? "고친 그림으로 바꾸기" : "표시 단 그림으로 바꾸기"}
              onCancel={() => {
                annot.done(null);
                setAnnot(null);
              }}
              onDone={onAnnotated}
            />
          )}

          {editor && !readOnly && (
            <Toolbar
              ref={toolbarRef}
              work={workRef}
              unfoldKey={unfoldKey}
              state={tb}
              actions={{
                undo: () => editor.chain().focus(undefined, { scrollIntoView: false }).undo().run(),
                redo: () => editor.chain().focus(undefined, { scrollIntoView: false }).redo().run(),
                setBlock: actions.setBlock,
                toggleList: actions.toggleList,
                insertBox: actions.insertBox,
                insertTable: actions.insertTable,
                tableOp: actions.tableOp,
                insertImage: (how) => void actions.insertImage(how),
                insertSteps: actions.insertSteps,
                more: (k) => void actions.more(k),
                toggleComment: () => setCommentMode((v) => !v),
              }}
            />
          )}

          {confirmLeave && (
            <div className="we-modal-back" role="presentation" onMouseDown={() => setConfirmLeave(false)}>
              <div
                className="we-modal"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="we-leave-t"
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.key === "Escape" && setConfirmLeave(false)}
              >
                <h2 id="we-leave-t">고친 내용을 버릴까요?</h2>
                <p>게시하지 않은 변경이 있어요. 나가면 이 브라우저에 남은 초안도 지워져요.</p>
                <div className="we-modal-acts">
                  <button type="button" className="we-btn" autoFocus onClick={() => setConfirmLeave(false)}>
                    계속 편집
                  </button>
                  <button
                    type="button"
                    className="we-btn we-btn--danger"
                    onClick={() => {
                      clearDraft(space, keyPath);
                      setConfirmLeave(false);
                      leave();
                    }}
                  >
                    버리고 나가기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </EditorUiContext.Provider>
  );
}

/* ───────────── 작은 부품 ───────────── */

/** 줄바꿈 없는 자동 높이 입력칸 (제목·설명). Enter 는 다음 칸으로 */
function TitleInput(props: {
  id: string;
  className: string;
  value: string;
  placeholder: string;
  readOnly: boolean;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      id={props.id}
      rows={1}
      className={props.className}
      value={props.value}
      placeholder={props.placeholder}
      readOnly={props.readOnly}
      onChange={(e) => props.onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          props.onEnter();
        }
      }}
    />
  );
}

/** 주소·문서 고르기 — 도구 막대 위에 뜨는 입력 줄 */
function PromptBar({ prompt, onClose }: { prompt: PromptState; onClose: () => void }) {
  const [value, setValue] = useState(prompt.initial ?? "");
  const [active, setActive] = useState(0);
  const list = useMemo(() => {
    if (!prompt.suggestions) return null;
    const q = value.trim().toLowerCase();
    return prompt.suggestions.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.desc ?? "").toLowerCase().includes(q)).slice(0, 8);
  }, [prompt.suggestions, value]);
  const submit = (key?: string) => {
    const k = key ?? list?.[active]?.key;
    if (prompt.suggestions && !k) return;
    onClose();
    prompt.onSubmit(value.trim(), k);
  };
  return (
    <div className="we-prompt" role="dialog" aria-label={prompt.label}>
      {list && list.length > 0 && (
        <DarkMenu
          className="we-menu--prompt"
          entries={list.map((s) => ({ key: s.key, name: s.name, desc: s.desc, icon: "page" }))}
          activeKey={list[active]?.key}
          onHover={(k) => setActive(list.findIndex((s) => s.key === k))}
          onPick={(it) => submit(it.key)}
        />
      )}
      <form
        className="we-prompt-bar"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Icon name={prompt.icon} size={15} />
        <span className="we-prompt-label">{prompt.label}</span>
        <input
          autoFocus
          value={value}
          placeholder={prompt.placeholder}
          aria-label={prompt.label}
          onChange={(e) => {
            setValue(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            } else if (list && e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, list.length - 1));
            } else if (list && e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            }
          }}
        />
        <button type="submit">넣기</button>
        <kbd>Esc</kbd>
      </form>
    </div>
  );
}

/* ───────────── 도우미 ───────────── */

function looksLikeMarkdown(text: string): boolean {
  if (!text.includes("\n") && !/\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|`[^`]+`/.test(text)) return false;
  return /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.+\|)/m.test(text) || /\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)/.test(text);
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url, "https://offair.local");
    if (u.hostname === "offair.local") return decodeURIComponent(u.pathname.split("/").pop() || "문서");
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function slugify(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "doc"
  );
}

/** 커서 자리의 낱말 범위 (댓글 모드에서 눌렀을 때) */
function wordAt(doc: Editor["state"]["doc"], pos: number): { from: number; to: number } {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock) return { from: pos, to: pos };
  const text = parent.textBetween(0, parent.content.size, "￼", "￼");
  const off = $pos.parentOffset;
  const isWord = (ch: string) => /[\p{L}\p{N}_·]/u.test(ch);
  let a = off;
  let b = off;
  while (a > 0 && isWord(text[a - 1])) a--;
  while (b < text.length && isWord(text[b])) b++;
  const start = $pos.start();
  return { from: start + a, to: start + b };
}
