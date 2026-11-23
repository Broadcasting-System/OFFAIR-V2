import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { StoreError } from "./errors";
import { blobHash, normalizeText, readIfExists } from "./fsutil";
import { parseSlug, toPosix } from "./paths";
import type { Actor, Change, Space } from "./space";

/**
 * 씨앗 폴더(.md·.mdx)를 한 공간으로 가져온다. 개발 문서(members) 처음 채우기용
 * (scripts/import-dev-docs.ts, 서버 PC 에서는 'OFFAIR 시작.cmd' 가 ONAIR-SERVER\docs\offair-dev 로 부른다).
 *
 * 규칙
 * - 씨앗의 `a/b.md`·`a/b.mdx` → 공간의 `docs/a/b.mdx` (주소 /members/a/b). 머리말(title·description·category·order)은 그대로 쓴다.
 *   title 이 없으면 첫 `# 제목` 줄, 그것도 없으면 파일 이름.
 * - `.`·`_` 로 시작하는 파일·폴더와 README.md 는 건너뛴다.
 * - 내용이 같으면 건너뛴다. 아무것도 지우지 않는다 (씨앗에서 빠진 문서도 위키에 그대로 둔다).
 * - 위키에서 누가 고친 문서는 덮어쓰지 않는다: 마지막으로 가져온 내용의 rev 를 공간 루트의
 *   `seed-import.json` 에 적어 두고, 지금 위키 문서가 그 rev 와 같을 때만 새 씨앗으로 바꾼다.
 *   가져온 적 없는 같은 경로 문서도 건너뛴다. (`overwrite` 를 켜면 둘 다 덮어쓴다)
 * - MDX 로 읽을 수 없는 문서는 건너뛰고 이유를 알려 준다 (화면이 깨지지 않게).
 * - 바뀐 문서·사이드바 카테고리·seed-import.json 을 한 번에 커밋한다 (공간의 보통 저장 경로 applyChanges).
 */

export const SEED_MANIFEST = "seed-import.json";
const MAX_DOC_BYTES = 2 * 1024 * 1024;
const DOC_EXT = /\.(md|mdx)$/i;

export const SEED_ACTOR: Actor = { name: "개발 문서 가져오기", memberId: "seed" };

export type ImportAction = "added" | "updated" | "unchanged" | "skipped";

export interface ImportItem {
  /** 씨앗 폴더 기준 경로 (a/b.md) */
  file: string;
  /** 공간 안 문서 경로 (a/b) — 경로가 잘못됐으면 빈 문자열 */
  slug: string;
  title: string;
  action: ImportAction;
  reason?: string;
}

export interface ImportReport {
  items: ImportItem[];
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  /** 사이드바(sidebar.json) 끝에 새로 붙인 카테고리 */
  categoriesAdded: string[];
  commit: string | null;
  dryRun: boolean;
}

export interface ImportOptions {
  /** 쓰지 않고 무엇을 할지만 */
  dryRun?: boolean;
  /** 위키에서 고친 문서·가져온 적 없는 같은 경로 문서도 덮어쓴다 */
  overwrite?: boolean;
  actor?: Actor;
  /** 커밋 본문에 적을 씨앗 설명 (예: "ONAIR-SERVER docs/offair-dev @ 1a2b3c4") */
  source?: string;
  /** MDX 확인. 오류 글을 돌려주면 건너뛴다. 기본은 @mdx-js/mdx 로 컴파일해 본다 */
  validate?: (body: string) => Promise<string | null>;
}

interface Manifest {
  version: 1;
  docs: Record<string, { rev: string; source: string }>;
}

/** 씨앗 폴더의 문서 파일 (정렬된 posix 상대 경로) */
export function listSeedFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string, rel: string) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name.startsWith("_")) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), childRel);
      else if (e.isFile() && DOC_EXT.test(e.name) && !/^readme\.mdx?$/i.test(e.name)) out.push(childRel);
    }
  };
  walk(dir, "");
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export async function validateMdx(body: string): Promise<string | null> {
  try {
    const { compile } = await import("@mdx-js/mdx");
    const { remarkGfmPlugin } = await import("@/lib/gfm");
    await compile(body, { remarkPlugins: [remarkGfmPlugin] });
    return null;
  } catch (e) {
    const err = e as { message?: string; line?: number; place?: { line?: number } };
    const line = err.line ?? err.place?.line;
    const msg = String(err.message ?? e).split("\n")[0];
    return line ? `${line}번째 줄: ${msg}` : msg;
  }
}

function readManifest(space: Space): Manifest {
  const buf = readIfExists(space.absOf(SEED_MANIFEST));
  if (buf) {
    try {
      const j = JSON.parse(buf.toString("utf8"));
      if (j && typeof j === "object" && j.docs && typeof j.docs === "object") return { version: 1, docs: j.docs };
    } catch {
      /* 깨졌으면 새로 쓴다 (기록이 없으니 기존 문서는 덮어쓰지 않는다) */
    }
  }
  return { version: 1, docs: {} };
}

function finish(raw: string): string {
  const t = normalizeText(raw);
  return t.endsWith("\n") ? t : t + "\n";
}

/** 씨앗 파일 하나 → 공간에 쓸 원문 (title 이 없으면 채운다) */
function prepare(file: string, text: string): { raw: string; body: string; title: string; category: string } {
  const src = normalizeText(text);
  const parsed = matter(src, {});
  const data = { ...(parsed.data as Record<string, unknown>) };
  const body = parsed.content;
  let raw = src;
  let title = typeof data.title === "string" || typeof data.title === "number" ? String(data.title).trim() : "";
  if (!title) {
    const h1 = /^#[ \t]+(.+?)[ \t#]*$/m.exec(body);
    title = (h1?.[1] ?? path.posix.basename(file).replace(DOC_EXT, "")).trim();
    const b = body.startsWith("\n") ? body : "\n" + body;
    raw = matter.stringify(b, { title, ...data });
  }
  const category = String(data.category ?? "").trim() || "문서";
  return { raw: finish(raw), body, title, category };
}

/**
 * 씨앗 폴더를 공간으로 가져온다. 공간의 저장 줄(lock) 안에서 한 번에 계획하고 한 커밋으로 남긴다.
 */
export async function importDocs(space: Space, seedDir: string, opts: ImportOptions = {}): Promise<ImportReport> {
  const dir = path.resolve(seedDir);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new StoreError("not_found", `씨앗 폴더가 없습니다: ${dir}`);
  }
  const validate = opts.validate ?? validateMdx;
  const files = listSeedFiles(dir);

  // MDX 확인은 느릴 수 있어 lock 밖에서 먼저 한다
  type Prepared = { file: string; key: string; raw: string; title: string; category: string };
  const items: ImportItem[] = [];
  const ready: Prepared[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const slugParts = file.replace(DOC_EXT, "").split("/");
    let key = "";
    try {
      key = parseSlug(slugParts).join("/");
    } catch (e) {
      items.push({ file, slug: "", title: "", action: "skipped", reason: `쓸 수 없는 파일 이름 (${(e as Error).message})` });
      continue;
    }
    if (seen.has(key)) {
      items.push({ file, slug: key, title: "", action: "skipped", reason: "같은 이름의 .md·.mdx 가 둘 다 있어요 (먼저 것만 가져옴)" });
      continue;
    }
    seen.add(key);
    let p: ReturnType<typeof prepare>;
    try {
      p = prepare(file, fs.readFileSync(path.join(dir, ...file.split("/")), "utf8"));
    } catch (e) {
      items.push({ file, slug: key, title: "", action: "skipped", reason: `머리말을 읽을 수 없어요 (${(e as Error).message.split("\n")[0]})` });
      continue;
    }
    if (Buffer.byteLength(p.raw, "utf8") > MAX_DOC_BYTES) {
      items.push({ file, slug: key, title: p.title, action: "skipped", reason: "문서가 너무 커요 (2MB 까지)" });
      continue;
    }
    const bad = await validate(p.body);
    if (bad) {
      items.push({ file, slug: key, title: p.title, action: "skipped", reason: `MDX 로 읽을 수 없어요 (${bad})` });
      continue;
    }
    ready.push({ file, key, raw: p.raw, title: p.title, category: p.category });
  }

  const plan = async () => {
    const manifest = readManifest(space);
    const before = JSON.stringify(manifest);
    const changes: Change[] = [];
    const written: Prepared[] = [];
    for (const r of ready) {
      const existing = space.getDoc(r.key);
      const rev = blobHash(r.raw);
      const record = () => {
        manifest.docs[r.key] = { rev, source: r.file };
      };
      if (!existing) {
        changes.push({ rel: space.relOf(r.key.split("/")), data: r.raw });
        written.push(r);
        record();
        items.push({ file: r.file, slug: r.key, title: r.title, action: "added" });
        continue;
      }
      if (existing.raw === r.raw) {
        if (manifest.docs[r.key]?.rev !== rev) record();
        items.push({ file: r.file, slug: r.key, title: r.title, action: "unchanged" });
        continue;
      }
      const last = manifest.docs[r.key];
      if (!opts.overwrite && !last) {
        items.push({ file: r.file, slug: r.key, title: r.title, action: "skipped", reason: "위키에 같은 경로의 문서가 이미 있어요" });
        continue;
      }
      if (!opts.overwrite && last.rev !== existing.rev) {
        items.push({ file: r.file, slug: r.key, title: r.title, action: "skipped", reason: "위키에서 고친 문서라 덮어쓰지 않았어요" });
        continue;
      }
      changes.push({ rel: existing.path, data: r.raw });
      written.push(r);
      record();
      items.push({ file: r.file, slug: r.key, title: r.title, action: "updated" });
    }

    // 사이드바: 새 카테고리를 끝에 붙인다 (있던 순서는 그대로)
    const sidebar = space.readSidebar();
    const hasSidebarFile = readIfExists(space.absOf(space.layout.sidebarFile)) !== null;
    const categories = hasSidebarFile ? [...sidebar.categories] : [...space.categoryOrder()];
    const categoriesAdded: string[] = [];
    for (const r of written) {
      if (!categories.includes(r.category)) {
        categories.push(r.category);
        categoriesAdded.push(r.category);
      }
    }
    if (categoriesAdded.length > 0 || (written.length > 0 && !hasSidebarFile)) {
      changes.push({ rel: space.layout.sidebarFile, data: JSON.stringify({ ...sidebar.extra, categories }, null, 2) + "\n" });
    }
    const docChanges = written.length;
    if (JSON.stringify(manifest) !== before) {
      const sorted: Manifest = { version: 1, docs: Object.fromEntries(Object.entries(manifest.docs).sort(([a], [b]) => (a < b ? -1 : 1))) };
      changes.push({ rel: SEED_MANIFEST, data: JSON.stringify(sorted, null, 2) + "\n" });
    }

    let commit: string | null = null;
    if (!opts.dryRun && changes.length > 0) {
      const added = items.filter((i) => i.action === "added");
      const updated = items.filter((i) => i.action === "updated");
      const subject =
        docChanges > 0
          ? `docs :: 개발 문서 가져오기 (새 문서 ${added.length}, 바뀐 문서 ${updated.length})`
          : "docs :: 개발 문서 가져오기 기록 맞춤";
      const body = [
        opts.source ? `씨앗: ${opts.source}` : null,
        ...added.map((i) => `+ ${i.slug} (${i.file})`),
        ...updated.map((i) => `~ ${i.slug} (${i.file})`),
        categoriesAdded.length ? `카테고리 추가: ${categoriesAdded.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      commit = await space.applyChanges(changes, subject, opts.actor ?? SEED_ACTOR, body || undefined);
    }
    return { commit, categoriesAdded };
  };

  const { commit, categoriesAdded } = opts.dryRun ? await plan() : await space.withLock(plan);
  items.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const count = (a: ImportAction) => items.filter((i) => i.action === a).length;
  return {
    items,
    added: count("added"),
    updated: count("updated"),
    unchanged: count("unchanged"),
    skipped: count("skipped"),
    categoriesAdded,
    commit,
    dryRun: !!opts.dryRun,
  };
}

/** 씨앗 폴더 설명 (커밋 본문용): 폴더 이름 + 그 폴더가 든 git 저장소의 짧은 커밋 */
export function describeSeed(dir: string, gitHead: string | null): string {
  const name = toPosix(path.basename(path.resolve(dir)));
  return gitHead ? `${name} @ ${gitHead}` : name;
}
