"use server";

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { revalidatePath } from "next/cache";
import { IS_DEV, resolveContentPath, CONTENT_ROOT_DIR } from "@/lib/dev";
import { HOME_CONFIG_FILE, type HomeConfig } from "@/lib/site";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const DOCS_DIR = path.join(CONTENT_ROOT_DIR, "docs");

function guard(): ActionResult | null {
  if (!IS_DEV)
    return { ok: false, error: "수정 모드는 개발 환경에서만 가능합니다." };
  return null;
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

/** Slug from a title; keeps Korean/word chars, collapses the rest to dashes. */
function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "doc";
}

/* ───────────────────────── Save existing file ───────────────────────── */

export async function saveDoc(
  relPath: string,
  content: string
): Promise<ActionResult> {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    await fsp.writeFile(resolveContentPath(relPath), content, "utf8");
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ───────────────────────── Create new doc ───────────────────────── */

export interface CreateResult extends ActionResult {
  url?: string;
  relPath?: string;
}

export async function createDoc(input: {
  title: string;
  category: string;
  slug?: string;
}): Promise<CreateResult> {
  const blocked = guard();
  if (blocked) return blocked;

  const title = input.title.trim();
  const category = input.category.trim() || "문서";
  if (!title) return { ok: false, error: "제목을 입력하세요." };

  try {
    const base = slugify(input.slug?.trim() || title);
    // ensure unique filename
    let slug = base;
    let n = 2;
    while (fs.existsSync(path.join(DOCS_DIR, `${slug}.mdx`))) {
      slug = `${base}-${n++}`;
    }

    // next order within the category
    let maxOrder = 0;
    if (fs.existsSync(DOCS_DIR)) {
      for (const name of fs.readdirSync(DOCS_DIR)) {
        if (!name.endsWith(".mdx")) continue;
        const { data } = matter(
          fs.readFileSync(path.join(DOCS_DIR, name), "utf8")
        );
        if (String(data.category ?? "") === category) {
          maxOrder = Math.max(maxOrder, Number(data.order ?? 0));
        }
      }
    }

    const body = matter.stringify("\n작성 예정.\n", {
      title,
      description: "",
      category,
      order: maxOrder + 1,
    });

    await fsp.mkdir(DOCS_DIR, { recursive: true });
    await fsp.writeFile(path.join(DOCS_DIR, `${slug}.mdx`), body, "utf8");
    revalidateAll();
    return { ok: true, url: `/docs/${slug}`, relPath: `docs/${slug}.mdx` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ───────────────────────── Delete doc ───────────────────────── */

export async function deleteDoc(relPath: string): Promise<ActionResult> {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    await fsp.unlink(resolveContentPath(relPath));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ───────────────────────── Home / hero copy ───────────────────────── */

export async function saveHome(config: HomeConfig): Promise<ActionResult> {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    const clean: HomeConfig = {
      eyebrow: String(config.eyebrow ?? ""),
      title: String(config.title ?? ""),
      description: String(config.description ?? ""),
      primaryCta: {
        label: String(config.primaryCta?.label ?? ""),
        href: String(config.primaryCta?.href ?? ""),
      },
      secondaryCta: {
        label: String(config.secondaryCta?.label ?? ""),
        href: String(config.secondaryCta?.href ?? ""),
      },
    };
    await fsp.writeFile(
      HOME_CONFIG_FILE,
      JSON.stringify(clean, null, 2) + "\n",
      "utf8"
    );
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ───────────────────────── Sidebar layout ───────────────────────── */

export interface SidebarPayload {
  groups: { category: string; items: { relPath: string }[] }[];
}

/**
 * Persist the full sidebar layout:
 * - category order → content/sidebar.json
 * - each doc's frontmatter `category` + `order` → its .mdx file
 */
export async function updateSidebar(
  payload: SidebarPayload
): Promise<ActionResult> {
  const blocked = guard();
  if (blocked) return blocked;

  try {
    const categories = payload.groups.map((g) => g.category.trim() || "문서");

    // 1) category order
    await fsp.writeFile(
      path.join(CONTENT_ROOT_DIR, "sidebar.json"),
      JSON.stringify({ categories }, null, 2) + "\n",
      "utf8"
    );

    // 2) per-doc frontmatter
    for (const group of payload.groups) {
      const category = group.category.trim() || "문서";
      for (let i = 0; i < group.items.length; i++) {
        const full = resolveContentPath(group.items[i].relPath);
        const raw = await fsp.readFile(full, "utf8");
        const parsed = matter(raw);
        parsed.data.category = category;
        parsed.data.order = i + 1;
        await fsp.writeFile(
          full,
          matter.stringify(parsed.content, parsed.data),
          "utf8"
        );
      }
    }

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
