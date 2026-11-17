/**
 * 머리말(frontmatter) 읽기·쓰기.
 * 알려진 키(title, description, category, order)는 늘 이 순서로 앞에 쓰고,
 * 나머지 키는 원래 순서 그대로 뒤에 붙인다 — 저장할 때마다 순서가 바뀌지 않게.
 */
import { parse, stringify } from "yaml";

export interface DocMetaFields {
  title: string;
  description: string;
  category: string;
  order: number | null;
  /** 그 밖의 키 (원래 순서 유지) */
  extra: Record<string, unknown>;
}

const KNOWN = ["title", "description", "category", "order"] as const;

export function parseFrontmatter(yamlText: string | null): DocMetaFields {
  let data: Record<string, unknown> = {};
  if (yamlText && yamlText.trim()) {
    const parsed = parse(yamlText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  }
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!(KNOWN as readonly string[]).includes(k)) extra[k] = v;
  }
  const order = data.order;
  return {
    title: data.title == null ? "" : String(data.title),
    description: data.description == null ? "" : String(data.description),
    category: data.category == null ? "" : String(data.category),
    order: typeof order === "number" ? order : order == null || order === "" ? null : Number(order),
    extra,
  };
}

export function stringifyFrontmatter(meta: DocMetaFields): string {
  const obj: Record<string, unknown> = {
    title: meta.title,
    description: meta.description,
    category: meta.category,
  };
  if (meta.order != null && !Number.isNaN(meta.order)) obj.order = meta.order;
  for (const [k, v] of Object.entries(meta.extra)) obj[k] = v;
  return stringify(obj, { lineWidth: 0 });
}

/** 파일 맨 앞의 `---\n…\n---` 를 떼어 낸다. 없으면 yaml 은 null. */
export function splitFrontmatter(source: string): { yaml: string | null; body: string } {
  const m = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(source);
  if (!m) return { yaml: null, body: source };
  return { yaml: m[1] ?? "", body: source.slice(m[0].length) };
}
