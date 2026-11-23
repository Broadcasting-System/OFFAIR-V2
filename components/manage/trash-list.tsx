"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DocIcon, RestoreIcon } from "@/components/shell/icons";
import { toast } from "@/components/ui/toast";
import { api, ApiError, canEditNow, emitTreeChanged, useMe } from "@/lib/wiki/client";
import { josa, SPACE_LABEL, type SpaceKey } from "@/lib/wiki/links";
import { restoreDoc } from "./tree-ops";

/**
 * 휴지통 — 공간마다 지워진 문서 목록과 "되살리기".
 * 두 공간 모두 부원 전용 (화면은 app/trash 가 먼저 막는다).
 */

interface TrashDoc {
  slug: string[];
  title: string;
  deletedAt: string;
  deletedBy: string;
  rev: string;
}

const when = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });

export function TrashList() {
  const me = useMe();
  const router = useRouter();
  const [lists, setLists] = useState<Partial<Record<SpaceKey, TrashDoc[] | "error">>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const spaces: SpaceKey[] = me?.canReadMembers ? ["guide", "members"] : [];
  const spaceKey = spaces.join(",");

  const load = useCallback(async (list: SpaceKey[]) => {
    const entries = await Promise.all(
      list.map(async (s) => {
        try {
          const r = await api<{ docs: TrashDoc[] }>(`/api/wiki/${s}/trash`);
          return [s, r.docs] as const;
        } catch {
          return [s, "error"] as const;
        }
      })
    );
    setLists(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    if (!me) return;
    // 바깥 시스템(API)에서 목록을 받아 온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(spaceKey.split(",") as SpaceKey[]);
  }, [me, spaceKey, load]);

  async function restore(space: SpaceKey, d: TrashDoc) {
    const id = `${space}:${d.slug.join("/")}`;
    setBusy(id);
    try {
      await restoreDoc(d.slug, d.rev, space);
      toast({ message: `「${d.title}」${josa(d.title, "을", "를")} 되살렸어요` });
      emitTreeChanged({ space });
      router.refresh();
      await load(spaces);
    } catch (e) {
      toast({ message: e instanceof ApiError ? e.message : "되살리지 못했어요", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  const editable = canEditNow(me);

  return (
    <div className="mt-7 flex flex-col gap-9">
      {spaces.map((s) => {
        const list = lists[s];
        return (
          <section key={s} aria-labelledby={`trash-${s}`}>
            <h2 id={`trash-${s}`} className="flex items-center gap-2 text-[13px] font-semibold tracking-[0.04em] text-fg-3">
              {SPACE_LABEL[s]}
              {Array.isArray(list) && <span className="font-normal">{list.length}개</span>}
            </h2>
            {list === undefined && <p className="mt-3 text-[14px] text-fg-3">불러오는 중…</p>}
            {list === "error" && <p className="mt-3 text-[14px] text-fg-3">목록을 불러오지 못했어요.</p>}
            {Array.isArray(list) && list.length === 0 && <p className="mt-3 text-[14px] text-fg-3">휴지통이 비어 있어요.</p>}
            {Array.isArray(list) && list.length > 0 && (
              <ul className="mt-2 divide-y divide-line-2 border-y border-line-2">
                {list.map((d) => {
                  const id = `${s}:${d.slug.join("/")}`;
                  return (
                    <li key={id} className="flex items-center gap-3 py-3">
                      <span className="grid size-[30px] flex-none place-items-center rounded-[7px] bg-hover text-fg-2">
                        <DocIcon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-fg">{d.title}</span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-fg-3">
                          {d.slug.join("/")} · {d.deletedBy} · {when.format(new Date(d.deletedAt))} 지움
                        </span>
                      </span>
                      {editable && (
                        <button
                          type="button"
                          onClick={() => restore(s, d)}
                          disabled={busy !== null}
                          className="inline-flex h-8 flex-none items-center gap-1.5 rounded-md border border-line px-3 text-[13px] font-medium text-fg transition-colors hover:bg-hover disabled:opacity-50"
                        >
                          <RestoreIcon size={15} />
                          {busy === id ? "되살리는 중…" : "되살리기"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
