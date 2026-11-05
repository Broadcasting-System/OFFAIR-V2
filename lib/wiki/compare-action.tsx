"use server";

import { headers } from "next/headers";
import { CompareDoc } from "@/components/history/compare-doc";
import { getSpace, isSpaceId } from "@/lib/store";
import { isStoreError } from "@/lib/store/errors";
import { canReadSpace, getViewer } from "./auth";

/**
 * 수정 기록 "본문에서 바로 비교" — 예전 버전(rev) 뒤로 바뀐 곳을 표시한 지금 문서를
 * 서버에서 MDX 로 그려 돌려준다 (React 요소 그대로). 읽기 권한은 API 와 같다.
 */
export async function compareRevision(
  space: string,
  slug: string[],
  rev: string
): Promise<{ ok: true; node: React.ReactNode; same: boolean } | { ok: false; message: string }> {
  if (!isSpaceId(space)) return { ok: false, message: "없는 공간이에요." };
  if (!Array.isArray(slug) || slug.length === 0 || typeof rev !== "string") return { ok: false, message: "잘못된 요청이에요." };
  const viewer = await getViewer(new Request("http://offair.local/", { headers: new Headers(await headers()) }));
  if (!canReadSpace(viewer, space)) return { ok: false, message: "이 문서를 볼 권한이 없어요." };
  try {
    const sp = getSpace(space);
    const cur = sp.getDoc(slug);
    if (!cur) return { ok: false, message: "지금 문서를 찾을 수 없어요." };
    const old = await sp.revision(slug, rev);
    const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
    const node = (
      <CompareDoc
        category={cur.category}
        oldTitle={old.title}
        newTitle={cur.title}
        oldDescription={str(old.frontmatter.description)}
        newDescription={cur.description}
        oldBody={old.body}
        newBody={cur.body}
      />
    );
    return { ok: true, node, same: old.raw === cur.raw };
  } catch (e) {
    return { ok: false, message: isStoreError(e) ? e.message : "비교하지 못했어요." };
  }
}
