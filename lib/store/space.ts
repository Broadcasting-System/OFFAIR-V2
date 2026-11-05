import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { createPatch, diffLines, structuredPatch } from "diff";
import { StoreError } from "./errors";
import { Git, assertRev, cleanIdent, type HistoryEntry } from "./git";
import { blobHash, normalizeText, readIfExists, removeFile, writeFileAtomic } from "./fsutil";
import { extractToc, mdxToPlainText, type TocItem } from "./markdown";
import { repoMutex } from "./mutex";
import { joinInside, parseRelFile, parseSlug, slugify, toPosix } from "./paths";

/**
 * 한 "공간"(guide = 공개, members = 부원 전용)의 문서 저장소.
 *
 * - 문서: <root>/<docsDir>/**\/*.mdx  (frontmatter: title·description·category·order)
 * - 사이드바 카테고리 순서: <root>/<sidebarFile>  ({"categories": [...]})
 * - 쓰기는 저장소마다 하나의 줄(mutex)에서 돌고, 바뀐 파일만 git 커밋한다.
 *   커밋이 실패하면 파일을 원래대로 되돌린다.
 * - 읽기는 동기(fs) — 파일 mtime/크기로 캐시한다. 외부에서 파일을 고쳐도(예: /edit) 바로 반영.
 */

export type SpaceId = "guide" | "members";

export interface SpaceLayout {
  id: SpaceId;
  /** git 저장소 루트 (공간 기준 경로의 기준) */
  root: string;
  docsDir: string;
  sidebarFile: string;
  uploadsDir: string;
  /** 업로드 파일을 가리키는 URL 앞부분 */
  uploadsUrl: string;
  /** 문서 페이지 URL 앞부분 */
  urlPrefix: string;
  defaultCategories: string[];
  /** 이 폴더가 저장소 최상위여야 함 (없으면 git init) */
  ownRoot: boolean;
  readOnly: boolean;
  commit: boolean;
  git: { bin: string; committerName: string; committerEmail: string; emailDomain: string };
  upload: { maxImageBytes: number; maxFileBytes: number };
}

export interface Actor {
  name: string;
  memberId?: string | null;
}

export interface DocMeta {
  space: SpaceId;
  slug: string[];
  /** 공간 루트 기준 파일 경로 (예: content/docs/intro.mdx) */
  path: string;
  url: string;
  title: string;
  description: string;
  category: string;
  order: number;
}

export interface DocFull extends DocMeta {
  /** 문서 리비전 = 지금 파일 내용의 git 블롭 해시. 저장할 때 baseRev 로 돌려보낸다 */
  rev: string;
  raw: string;
  body: string;
  frontmatter: Record<string, unknown>;
  toc: TocItem[];
}

export interface NavGroup {
  category: string;
  order: number;
  items: DocMeta[];
}

export interface Tree {
  space: SpaceId;
  /** 사이드바 설정 순서 + 설정에 없는 카테고리(가나다순). 빈 카테고리도 포함 */
  categories: string[];
  /** categories 순서대로. 빈 카테고리도 포함 (items: []) */
  groups: NavGroup[];
}

export interface WriteResult {
  doc: DocFull | null;
  /** 만든 커밋 (바뀐 게 없거나 커밋을 끈 경우 null) */
  commit: string | null;
}

export interface SearchEntry {
  space: SpaceId;
  slug: string[];
  url: string;
  title: string;
  description: string;
  category: string;
  headings: string[];
  text: string;
}

export interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

export type Change = { rel: string; data: string | Buffer | null };

export interface SaveInput {
  baseRev: string;
  /** frontmatter 를 포함한 MDX 원문 전체. 주면 frontmatter/body 는 무시 */
  raw?: string;
  /** 지금 frontmatter 위에 덮어쓴다. 값을 null 로 주면 그 키를 지운다 */
  frontmatter?: Record<string, unknown>;
  body?: string;
  /** 편집 요약 — 커밋 본문으로 들어간다 */
  message?: string;
}

export interface CreateInput {
  title: string;
  category?: string;
  slug?: string | string[];
  description?: string;
  body?: string;
  frontmatter?: Record<string, unknown>;
  message?: string;
}

export interface MoveInput {
  /** 새 경로 (이름 바꾸기·폴더 옮기기) */
  to?: string | string[];
  /** 새 카테고리 */
  category?: string;
  /** 카테고리 안 위치 (0부터). 주면 그 카테고리 문서 order 를 1..n 으로 다시 매긴다 */
  index?: number;
  baseRev?: string;
}

export type CategoryOp =
  | { action: "add"; name: string; index?: number }
  | { action: "rename"; from: string; to: string }
  | { action: "remove"; name: string }
  | { action: "reorder"; categories: string[] };

interface CacheEntry {
  mtimeMs: number;
  size: number;
  doc: DocFull;
}

const MAX_DOC_BYTES = 2 * 1024 * 1024;

export class Space {
  readonly id: SpaceId;
  readonly layout: SpaceLayout;
  readonly git: Git;
  private cache = new Map<string, CacheEntry>();
  /** 커밋 뒤 불린다 (공개 공간 push 예약 등) */
  onCommit: ((sha: string) => void) | null = null;

  constructor(layout: SpaceLayout) {
    this.id = layout.id;
    this.layout = { ...layout, root: path.resolve(/*turbopackIgnore: true*/ layout.root) };
    this.git = new Git(this.layout.root, {
      bin: layout.git.bin,
      committer: { name: layout.git.committerName, email: layout.git.committerEmail },
      ownRoot: layout.ownRoot,
    });
  }

  /* ───────────────────────── 경로 ───────────────────────── */

  get docsRoot(): string {
    return path.join(this.layout.root, ...this.layout.docsDir.split("/"));
  }

  relOf(slug: string[]): string {
    return `${this.layout.docsDir}/${slug.join("/")}.mdx`;
  }

  absOf(rel: string): string {
    return joinInside(this.layout.root, parseRelFile(rel));
  }

  urlOf(slug: string[]): string {
    return `${this.layout.urlPrefix}/${slug.join("/")}`;
  }

  private slugOfRel(rel: string): string[] | null {
    const prefix = this.layout.docsDir + "/";
    if (!rel.startsWith(prefix) || !rel.endsWith(".mdx")) return null;
    return rel.slice(prefix.length, -4).split("/");
  }

  /* ───────────────────────── 읽기 ───────────────────────── */

  private walk(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.name.startsWith(".")) return [];
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return this.walk(full);
      if (e.isFile() && e.name.endsWith(".mdx")) return [full];
      return [];
    });
  }

  private parseFile(abs: string, rawBuf: Buffer): DocFull {
    const rel = toPosix(path.relative(this.layout.root, abs));
    const slug = this.slugOfRel(rel) ?? [path.basename(abs, ".mdx")];
    const raw = normalizeText(rawBuf.toString("utf8"));
    let data: Record<string, unknown> = {};
    let content = raw;
    try {
      const parsed = matter(raw, {});
      data = { ...(parsed.data as Record<string, unknown>) };
      content = parsed.content;
    } catch {
      /* frontmatter 가 깨졌으면 본문 전체를 그대로 보여 준다 */
    }
    const order = Number(data.order ?? 999);
    return {
      space: this.id,
      slug,
      path: rel,
      url: this.urlOf(slug),
      title: String(data.title ?? slug[slug.length - 1]),
      description: String(data.description ?? ""),
      category: String(data.category ?? "문서"),
      order: Number.isFinite(order) ? order : 999,
      rev: blobHash(raw),
      raw,
      body: content,
      frontmatter: jsonSafe(data),
      toc: extractToc(content),
    };
  }

  private load(abs: string): DocFull | null {
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      this.cache.delete(abs);
      return null;
    }
    if (!st.isFile()) return null;
    const hit = this.cache.get(abs);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.doc;
    const doc = this.parseFile(abs, fs.readFileSync(abs));
    this.cache.set(abs, { mtimeMs: st.mtimeMs, size: st.size, doc });
    return doc;
  }

  /** 모든 문서 (순서 없음) */
  listDocs(): DocFull[] {
    const files = this.walk(this.docsRoot);
    const seen = new Set(files);
    for (const k of this.cache.keys()) if (!seen.has(k)) this.cache.delete(k);
    return files.map((f) => this.load(f)).filter((d): d is DocFull => d !== null);
  }

  getDoc(slugInput: string | string[]): DocFull | null {
    const slug = parseSlug(slugInput);
    return this.load(this.absOf(this.relOf(slug)));
  }

  requireDoc(slugInput: string | string[]): DocFull {
    const doc = this.getDoc(slugInput);
    if (!doc) throw new StoreError("not_found", "문서를 찾을 수 없습니다.");
    return doc;
  }

  readSidebar(): { categories: string[]; extra: Record<string, unknown> } {
    const buf = readIfExists(this.absOf(this.layout.sidebarFile));
    if (buf) {
      try {
        const json = JSON.parse(buf.toString("utf8"));
        if (json && typeof json === "object") {
          const { categories, ...extra } = json as Record<string, unknown>;
          if (Array.isArray(categories)) {
            return { categories: categories.map(String), extra };
          }
          return { categories: [...this.layout.defaultCategories], extra };
        }
      } catch {
        /* 깨진 설정 — 기본값 */
      }
    }
    return { categories: [...this.layout.defaultCategories], extra: {} };
  }

  /** 사이드바 설정의 카테고리 순서 (비어 있으면 기본값) — 기존 getCategoryOrder 와 같은 규칙 */
  categoryOrder(): string[] {
    const { categories } = this.readSidebar();
    return categories.length > 0 ? categories : [...this.layout.defaultCategories];
  }

  tree(): Tree {
    const order = this.categoryOrder();
    const rank = (c: string) => {
      const i = order.indexOf(c);
      return i === -1 ? order.length : i;
    };
    const byCat = new Map<string, DocMeta[]>();
    for (const c of order) byCat.set(c, []);
    for (const d of this.listDocs()) {
      const list = byCat.get(d.category) ?? [];
      list.push(toMeta(d));
      byCat.set(d.category, list);
    }
    const groups = [...byCat.entries()]
      .map(([category, items]) => ({
        category,
        order: rank(category),
        items: items.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.order - b.order || a.category.localeCompare(b.category));
    return { space: this.id, categories: groups.map((g) => g.category), groups };
  }

  searchIndex(): SearchEntry[] {
    const flat = this.tree().groups.flatMap((g) => g.items.map((i) => i.path));
    const docs = this.listDocs();
    docs.sort((a, b) => flat.indexOf(a.path) - flat.indexOf(b.path));
    return docs.map((d) => ({
      space: this.id,
      slug: d.slug,
      url: d.url,
      title: d.title,
      description: d.description,
      category: d.category,
      headings: d.toc.map((t) => t.text),
      text: mdxToPlainText(d.body),
    }));
  }

  /* ───────────────────────── 쓰기 공통 ───────────────────────── */

  private lock<T>(task: () => Promise<T>): Promise<T> {
    if (this.layout.readOnly) {
      return Promise.reject(new StoreError("read_only", "이 서버는 읽기 전용입니다."));
    }
    return repoMutex.run(this.layout.root, task);
  }

  private identity(actor: Actor) {
    const id = String(actor.memberId ?? "").replace(/[^A-Za-z0-9._-]/g, "") || "anonymous";
    return {
      name: cleanIdent(actor.name, "익명"),
      email: `${id}@${this.layout.git.emailDomain}`,
    };
  }

  /**
   * 파일 변경을 적용하고 한 커밋으로 남긴다. 커밋이 실패하면 원래대로 되돌린다.
   * 반드시 lock 안에서 부른다.
   */
  async applyChanges(changes: Change[], subject: string, actor: Actor, body?: string): Promise<string | null> {
    const targets = changes.map((c) => ({ ...c, abs: this.absOf(c.rel) }));
    const before = targets.map((t) => ({ abs: t.abs, prev: readIfExists(t.abs) }));
    try {
      for (const t of targets) {
        if (t.data === null) await removeFile(t.abs);
        else await writeFileAtomic(t.abs, t.data);
      }
      let sha: string | null = null;
      if (this.layout.commit) {
        if (this.layout.ownRoot) await this.git.ensureRepo();
        else if (!(await this.git.ready())) {
          throw new StoreError("git_failed", `git 저장소가 아닙니다: ${this.layout.root}`);
        }
        sha = await this.git.commit(
          [...new Set(targets.map((t) => t.rel))],
          subject,
          this.identity(actor),
          body
        );
      }
      for (const t of targets) this.cache.delete(t.abs);
      if (sha && this.onCommit) {
        try {
          this.onCommit(sha);
        } catch {
          /* push 예약 실패는 저장을 막지 않는다 */
        }
      }
      return sha;
    } catch (e) {
      for (const b of before) {
        try {
          if (b.prev === null) await removeFile(b.abs);
          else await writeFileAtomic(b.abs, b.prev);
        } catch {
          /* 최선을 다해 되돌린다 */
        }
        this.cache.delete(b.abs);
      }
      throw e;
    }
  }

  /** 저장소 줄 안에서 임의 작업 (업로드 등) */
  withLock<T>(task: () => Promise<T>): Promise<T> {
    return this.lock(task);
  }

  private checkRev(doc: DocFull, baseRev: string | undefined, required: boolean) {
    if (baseRev === undefined || baseRev === null || baseRev === "") {
      if (required) throw new StoreError("bad_request", "baseRev 가 필요합니다.");
      return;
    }
    if (baseRev !== doc.rev) {
      throw new StoreError("conflict", "그 사이 다른 사람이 문서를 고쳤습니다.", {
        currentRev: doc.rev,
        current: { raw: doc.raw, title: doc.title },
      });
    }
  }

  /* ───────────────────────── 문서 쓰기 ───────────────────────── */

  save(slugInput: string | string[], input: SaveInput, actor: Actor): Promise<WriteResult> {
    const slug = parseSlug(slugInput);
    return this.lock(async () => {
      const doc = this.getDoc(slug);
      if (!doc) throw new StoreError("not_found", "문서를 찾을 수 없습니다.");
      this.checkRev(doc, input.baseRev, true);
      let raw: string;
      if (typeof input.raw === "string") {
        raw = input.raw;
      } else {
        const fm = mergeFrontmatter(doc.frontmatter, input.frontmatter);
        raw = stringifyDoc(fm, typeof input.body === "string" ? input.body : doc.body);
      }
      raw = finishText(raw);
      assertSize(raw);
      assertParsable(raw);
      if (raw === doc.raw) return { doc, commit: null };
      const title = titleOf(raw, slug);
      const sha = await this.applyChanges(
        [{ rel: doc.path, data: raw }],
        `docs :: 「${title}」 수정`,
        actor,
        input.message
      );
      return { doc: this.getDoc(slug), commit: sha };
    });
  }

  create(input: CreateInput, actor: Actor): Promise<WriteResult> {
    return this.lock(async () => {
      const title = String(input.title ?? "").trim();
      if (!title) throw new StoreError("bad_request", "제목을 입력하세요.");
      const category = cleanCategory(input.category) || "문서";
      let slug: string[];
      if (input.slug !== undefined && input.slug !== null && String(input.slug).length > 0) {
        slug = parseSlug(input.slug);
        if (this.getDoc(slug)) throw new StoreError("exists", "같은 경로의 문서가 이미 있습니다.");
      } else {
        const base = slugify(title);
        slug = [base];
        for (let n = 2; this.getDoc(slug); n++) slug = [`${base}-${n}`];
      }
      const maxOrder = this.listDocs()
        .filter((d) => d.category === category)
        .reduce((m, d) => Math.max(m, d.order === 999 ? 0 : d.order), 0);
      const fm = mergeFrontmatter(
        { title, description: String(input.description ?? ""), category, order: maxOrder + 1 },
        input.frontmatter
      );
      const raw = finishText(stringifyDoc(fm, input.body ?? "\n작성 예정.\n"));
      assertSize(raw);
      assertParsable(raw);
      const sha = await this.applyChanges(
        [{ rel: this.relOf(slug), data: raw }],
        `docs :: 「${title}」 만듦`,
        actor,
        input.message
      );
      return { doc: this.getDoc(slug), commit: sha };
    });
  }

  remove(slugInput: string | string[], opts: { baseRev?: string; message?: string }, actor: Actor): Promise<WriteResult> {
    const slug = parseSlug(slugInput);
    return this.lock(async () => {
      const doc = this.getDoc(slug);
      if (!doc) throw new StoreError("not_found", "문서를 찾을 수 없습니다.");
      this.checkRev(doc, opts.baseRev, false);
      const sha = await this.applyChanges(
        [{ rel: doc.path, data: null }],
        `docs :: 「${doc.title}」 삭제`,
        actor,
        opts.message
      );
      return { doc: null, commit: sha };
    });
  }

  /**
   * 이름 바꾸기·폴더 옮기기·카테고리 옮기기·순서 바꾸기.
   * 경로가 바뀌면 내용은 그대로 둔 채 먼저 한 커밋(git 이 이름 바뀜으로 알아보게),
   * 그다음 frontmatter 변경을 또 한 커밋으로 남긴다.
   */
  move(slugInput: string | string[], input: MoveInput, actor: Actor): Promise<WriteResult & { from: string[]; commits: string[] }> {
    const from = parseSlug(slugInput);
    const to = input.to !== undefined && input.to !== null && String(input.to) !== "" ? parseSlug(input.to) : from;
    return this.lock(async () => {
      const doc = this.getDoc(from);
      if (!doc) throw new StoreError("not_found", "문서를 찾을 수 없습니다.");
      this.checkRev(doc, input.baseRev, false);
      const commits: string[] = [];
      const pathChanged = to.join("/") !== from.join("/");
      if (pathChanged) {
        if (this.getDoc(to)) throw new StoreError("exists", "옮길 경로에 이미 문서가 있습니다.");
        const sha = await this.applyChanges(
          [
            { rel: doc.path, data: null },
            { rel: this.relOf(to), data: doc.raw },
          ],
          `docs :: 「${doc.title}」 이동 (${from.join("/")} → ${to.join("/")})`,
          actor
        );
        if (sha) commits.push(sha);
      }

      const category = input.category !== undefined ? cleanCategory(input.category) || "문서" : doc.category;
      const changes: Change[] = [];
      if (input.index !== undefined || category !== doc.category) {
        const others = this.listDocs()
          .filter((d) => d.category === category && d.slug.join("/") !== to.join("/"))
          .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
        const moving = this.getDoc(to)!;
        const index = input.index === undefined ? others.length : clampIndex(input.index, others.length);
        const list = [...others.slice(0, index), moving, ...others.slice(index)];
        list.forEach((d, i) => {
          const order = i + 1;
          if (d.category === category && d.order === order) return;
          changes.push({ rel: d.path, data: withFrontmatter(d, { category, order }) });
        });
      }
      if (changes.length > 0) {
        const sha = await this.applyChanges(
          changes,
          category !== doc.category
            ? `docs :: 「${doc.title}」 카테고리 이동 (${doc.category} → ${category})`
            : `docs :: 「${doc.title}」 순서 변경`,
          actor
        );
        if (sha) commits.push(sha);
      }
      return { doc: this.getDoc(to), commit: commits[commits.length - 1] ?? null, commits, from };
    });
  }

  /**
   * 사이드바 전체 배치 저장 (기존 /edit 의 updateSidebar 와 같은 모양).
   * groups 순서 → 카테고리 순서, items 순서 → order 1..n. 바뀐 파일만 쓴다.
   */
  setLayout(groups: { category: string; items: (string | string[])[] }[], actor: Actor): Promise<WriteResult & { tree: Tree }> {
    if (!Array.isArray(groups)) throw new StoreError("bad_request", "groups 가 필요합니다.");
    const parsed = groups.map((g) => ({
      category: cleanCategory(g?.category) || "문서",
      items: (Array.isArray(g?.items) ? g.items : []).map((s) => parseSlug(s)),
    }));
    return this.lock(async () => {
      const changes: Change[] = [];
      const categories = dedupe(parsed.map((g) => g.category));
      const sidebar = this.readSidebar();
      if (JSON.stringify(sidebar.categories) !== JSON.stringify(categories)) {
        changes.push({ rel: this.layout.sidebarFile, data: sidebarJson(categories, sidebar.extra) });
      }
      const seen = new Set<string>();
      for (const g of parsed) {
        g.items.forEach((slug, i) => {
          const key = slug.join("/");
          if (seen.has(key)) throw new StoreError("bad_request", `문서가 두 번 들어 있습니다: ${key}`);
          seen.add(key);
          const d = this.getDoc(slug);
          if (!d) throw new StoreError("not_found", `문서를 찾을 수 없습니다: ${key}`);
          const order = i + 1;
          if (d.category !== g.category || d.order !== order) {
            changes.push({ rel: d.path, data: withFrontmatter(d, { category: g.category, order }) });
          }
        });
      }
      const sha = changes.length
        ? await this.applyChanges(changes, "docs :: 사이드바 구성 변경", actor)
        : null;
      return { doc: null, commit: sha, tree: this.tree() };
    });
  }

  /** 카테고리 추가·이름 바꾸기·지우기(빈 것만)·순서 바꾸기 */
  editCategories(op: CategoryOp, actor: Actor): Promise<WriteResult & { tree: Tree }> {
    return this.lock(async () => {
      const sidebar = this.readSidebar();
      const current = this.tree().categories;
      let categories = [...sidebar.categories];
      const changes: Change[] = [];
      let subject: string;
      switch (op?.action) {
        case "add": {
          const name = cleanCategory(op.name);
          if (!name) throw new StoreError("bad_request", "카테고리 이름이 필요합니다.");
          if (current.includes(name) && categories.includes(name)) {
            throw new StoreError("exists", "이미 있는 카테고리입니다.");
          }
          categories = categories.filter((c) => c !== name);
          const at = op.index === undefined ? categories.length : clampIndex(op.index, categories.length);
          categories.splice(at, 0, name);
          subject = `docs :: 카테고리 「${name}」 추가`;
          break;
        }
        case "rename": {
          const fromName = cleanCategory(op.from);
          const toName = cleanCategory(op.to);
          if (!fromName || !toName) throw new StoreError("bad_request", "카테고리 이름이 필요합니다.");
          if (!current.includes(fromName)) throw new StoreError("not_found", "카테고리를 찾을 수 없습니다.");
          if (fromName !== toName && current.includes(toName)) {
            throw new StoreError("exists", "같은 이름의 카테고리가 이미 있습니다.");
          }
          categories = categories.includes(fromName)
            ? categories.map((c) => (c === fromName ? toName : c))
            : [...categories, toName];
          for (const d of this.listDocs()) {
            if (d.category === fromName) {
              changes.push({ rel: d.path, data: withFrontmatter(d, { category: toName }) });
            }
          }
          subject = `docs :: 카테고리 이름 변경 (${fromName} → ${toName})`;
          break;
        }
        case "remove": {
          const name = cleanCategory(op.name);
          if (this.listDocs().some((d) => d.category === name)) {
            throw new StoreError("conflict", "문서가 남아 있는 카테고리는 지울 수 없습니다.", { reason: "not_empty" });
          }
          if (!categories.includes(name)) throw new StoreError("not_found", "카테고리를 찾을 수 없습니다.");
          categories = categories.filter((c) => c !== name);
          subject = `docs :: 카테고리 「${name}」 삭제`;
          break;
        }
        case "reorder": {
          if (!Array.isArray(op.categories)) throw new StoreError("bad_request", "categories 가 필요합니다.");
          const next = dedupe(op.categories.map((c) => cleanCategory(c)).filter(Boolean));
          // 빠뜨린 카테고리는 뒤에 붙인다
          categories = [...next, ...categories.filter((c) => !next.includes(c))];
          subject = "docs :: 카테고리 순서 변경";
          break;
        }
        default:
          throw new StoreError("bad_request", "알 수 없는 카테고리 작업입니다.");
      }
      if (JSON.stringify(categories) !== JSON.stringify(sidebar.categories) || !readIfExists(this.absOf(this.layout.sidebarFile))) {
        changes.push({ rel: this.layout.sidebarFile, data: sidebarJson(categories, sidebar.extra) });
      }
      const sha = changes.length ? await this.applyChanges(changes, subject, actor) : null;
      return { doc: null, commit: sha, tree: this.tree() };
    });
  }

  /* ───────────────────────── 이력 ───────────────────────── */

  async history(slugInput: string | string[], limit = 100) {
    const slug = parseSlug(slugInput);
    const rel = this.relOf(slug);
    const [entries, stats] = await Promise.all([this.git.log(rel, limit), this.git.stats(rel, limit)]);
    return entries.map((e) => {
      const s = stats.get(e.rev);
      return { ...this.decorate(e), added: s?.added ?? 0, removed: s?.removed ?? 0, body: s?.body ?? "" };
    });
  }

  private decorate(e: HistoryEntry) {
    return { ...e, slug: this.slugOfRel(e.path), ...(e.from ? { fromSlug: this.slugOfRel(e.from) } : {}) };
  }

  /** 리비전(커밋)에서의 문서. 이름이 바뀌었어도 이력을 따라 그때 경로를 찾는다 */
  async revision(slugInput: string | string[], revInput: string) {
    const slug = parseSlug(slugInput);
    const commit = await this.git.resolveCommit(assertRev(revInput));
    if (!commit) throw new StoreError("not_found", "리비전을 찾을 수 없습니다.");
    const hist = await this.git.log(this.relOf(slug), 1000);
    const entry = hist.find((h) => h.rev === commit);
    let rel = entry?.path || this.relOf(slug);
    let raw: string | null;
    let deleted = false;
    if (entry?.status === "D") {
      // 삭제 커밋: 지우기 직전 내용
      deleted = true;
      const parentIdx = hist.indexOf(entry) + 1;
      const parent = hist[parentIdx];
      if (parent) rel = parent.path || rel;
      raw = parent ? await this.git.show(parent.rev, rel) : null;
    } else {
      raw = await this.git.show(commit, rel);
    }
    if (raw === null) throw new StoreError("not_found", "그 리비전에는 이 문서가 없습니다.");
    raw = normalizeText(raw);
    let fm: Record<string, unknown> = {};
    let body = raw;
    try {
      const p = matter(raw, {});
      fm = jsonSafe({ ...(p.data as Record<string, unknown>) });
      body = p.content;
    } catch {
      /* 그대로 */
    }
    return {
      space: this.id,
      slug,
      rev: commit,
      path: rel,
      deleted,
      contentRev: blobHash(raw),
      raw,
      body,
      frontmatter: fm,
      title: String(fm.title ?? slug[slug.length - 1]),
      entry: entry ? this.decorate(entry) : null,
    };
  }

  /** from → to 비교. to 를 비우면 지금 파일과 비교. from 이 "empty" 면 빈 문서와 비교 */
  async diff(slugInput: string | string[], fromRev: string, toRev?: string) {
    const slug = parseSlug(slugInput);
    const left = fromRev === "empty" ? "" : (await this.revision(slug, fromRev)).raw;
    let right: string;
    let toLabel: string;
    if (!toRev || toRev === "current") {
      const cur = this.getDoc(slug);
      right = cur ? cur.raw : "";
      toLabel = "current";
    } else {
      right = (await this.revision(slug, toRev)).raw;
      toLabel = toRev;
    }
    const name = this.relOf(slug);
    const unified = createPatch(name, left, right, fromRev, toLabel);
    const patch = structuredPatch(name, name, left, right, fromRev, toLabel);
    const lines: DiffLine[] = [];
    let oldNo = 1;
    let newNo = 1;
    let added = 0;
    let removed = 0;
    for (const part of diffLines(left, right)) {
      const ls = part.value.split("\n");
      if (ls[ls.length - 1] === "") ls.pop();
      for (const text of ls) {
        if (part.added) {
          lines.push({ type: "add", text, oldNo: null, newNo: newNo++ });
          added++;
        } else if (part.removed) {
          lines.push({ type: "del", text, oldNo: oldNo++, newNo: null });
          removed++;
        } else {
          lines.push({ type: "ctx", text, oldNo: oldNo++, newNo: newNo++ });
        }
      }
    }
    return { space: this.id, slug, from: fromRev, to: toLabel, added, removed, unified, hunks: patch.hunks, lines };
  }

  /** 문서를 예전 리비전 내용으로 되돌린다 (새 커밋). 지워진 문서면 되살린다 */
  revert(slugInput: string | string[], revInput: string, opts: { baseRev?: string; message?: string }, actor: Actor): Promise<WriteResult> {
    const slug = parseSlug(slugInput);
    return this.lock(async () => {
      const target = await this.revision(slug, revInput);
      const cur = this.getDoc(slug);
      if (cur) this.checkRev(cur, opts.baseRev, false);
      const raw = finishText(target.raw);
      if (cur && cur.raw === raw) return { doc: cur, commit: null };
      const sha = await this.applyChanges(
        [{ rel: this.relOf(slug), data: raw }],
        cur
          ? `docs :: 「${target.title}」 ${target.rev.slice(0, 7)} 버전으로 되돌림`
          : `docs :: 「${target.title}」 되살림 (${target.rev.slice(0, 7)})`,
        actor,
        opts.message
      );
      return { doc: this.getDoc(slug), commit: sha };
    });
  }

  /** 지워진 문서 목록 (되살리기용). 지금 다시 있는 경로는 뺀다 */
  async trash(limit = 100) {
    const entries = await this.git.deletedUnder(this.layout.docsDir, limit * 2);
    const seen = new Set<string>();
    const out = [];
    for (const e of entries) {
      if (e.status !== "D" || !e.path.endsWith(".mdx") || seen.has(e.path)) continue;
      seen.add(e.path);
      const slug = this.slugOfRel(e.path);
      if (!slug || this.getDoc(slug)) continue;
      const m = /「(.+?)」/.exec(e.message);
      out.push({
        slug,
        path: e.path,
        title: m ? m[1] : slug[slug.length - 1],
        deletedAt: e.date,
        deletedBy: e.author,
        rev: e.rev,
      });
      if (out.length >= limit) break;
    }
    return out;
  }
}

/* ───────────────────────── 도우미 ───────────────────────── */

function toMeta(d: DocFull): DocMeta {
  return {
    space: d.space,
    slug: d.slug,
    path: d.path,
    url: d.url,
    title: d.title,
    description: d.description,
    category: d.category,
    order: d.order,
  };
}

export { toMeta };

/** YAML 날짜 등 → JSON 으로 보낼 수 있는 값 */
function jsonSafe(data: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(data ?? {}));
}

function mergeFrontmatter(base: Record<string, unknown>, patch?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  if (patch && typeof patch === "object" && !Array.isArray(patch)) {
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete out[k];
      else out[k] = v;
    }
  }
  if (out.order !== undefined) {
    const n = Number(out.order);
    out.order = Number.isFinite(n) ? n : 999;
  }
  return out;
}

function stringifyDoc(fm: Record<string, unknown>, body: string): string {
  let b = normalizeText(String(body ?? ""));
  if (!b.startsWith("\n")) b = "\n" + b;
  return matter.stringify(b, fm);
}

function withFrontmatter(d: DocFull, patch: Record<string, unknown>): string {
  return finishText(stringifyDoc(mergeFrontmatter(d.frontmatter, patch), d.body));
}

function finishText(s: string): string {
  const t = normalizeText(String(s ?? ""));
  return t.endsWith("\n") ? t : t + "\n";
}

function assertSize(raw: string) {
  if (Buffer.byteLength(raw, "utf8") > MAX_DOC_BYTES) {
    throw new StoreError("too_large", "문서가 너무 큽니다 (2MB 까지).");
  }
}

function assertParsable(raw: string) {
  try {
    matter(raw, {});
  } catch (e) {
    throw new StoreError("bad_request", `frontmatter 를 읽을 수 없습니다: ${(e as Error).message}`);
  }
}

function titleOf(raw: string, slug: string[]): string {
  try {
    const t = (matter(raw, {}).data as Record<string, unknown>).title;
    if (t) return cleanIdent(String(t), slug[slug.length - 1]);
  } catch {
    /* 무시 */
  }
  return slug[slug.length - 1];
}

function cleanCategory(c: unknown): string {
  return String(c ?? "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 60);
}

function clampIndex(i: number, len: number): number {
  const n = Math.floor(Number(i));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, len);
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function sidebarJson(categories: string[], extra: Record<string, unknown>): string {
  return JSON.stringify({ ...extra, categories }, null, 2) + "\n";
}
