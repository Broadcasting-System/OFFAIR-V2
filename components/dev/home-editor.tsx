"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveHome } from "@/app/edit/actions";
import type { HomeConfig } from "@/lib/site";

export function HomeEditor({ initial }: { initial: HomeConfig }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<HomeConfig>(initial);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [pending, start] = useTransition();

  const dirty = JSON.stringify(cfg) !== JSON.stringify(initial);

  const set = (patch: Partial<HomeConfig>) =>
    setCfg((c) => ({ ...c, ...patch }));
  const setCta = (
    key: "primaryCta" | "secondaryCta",
    patch: Partial<HomeConfig["primaryCta"]>
  ) => setCfg((c) => ({ ...c, [key]: { ...c[key], ...patch } }));

  const save = () =>
    start(async () => {
      const res = await saveHome(cfg);
      if (res.ok) {
        setStatus("ok");
        router.refresh();
        setTimeout(() => setStatus("idle"), 2000);
      } else setStatus("error");
    });

  return (
    <div className="space-y-6">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/edit"
          className="text-fg-muted transition-colors hover:text-white"
        >
          ←
        </Link>
        <span className="rounded bg-amber-400/10 px-2 py-0.5 font-mono text-[0.7rem] font-semibold uppercase tracking-wider text-amber-300">
          홈 화면 편집
        </span>
        <div className="ml-auto flex items-center gap-3">
          {status === "ok" && (
            <span className="font-mono text-xs text-emerald-300">저장됨 ✓</span>
          )}
          {status === "error" && (
            <span className="font-mono text-xs text-rose-300">저장 실패</span>
          )}
          {dirty && status === "idle" && (
            <span className="font-mono text-xs text-amber-300">변경됨</span>
          )}
          <Link
            href="/"
            className="rounded-md border border-line px-3 py-1.5 text-sm text-fg-muted hover:text-white"
          >
            홈 보기
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="rounded-md bg-beam-500 px-4 py-1.5 text-sm font-medium text-ink-950 hover:bg-beam-400 disabled:opacity-40"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>

      {/* live hero preview */}
      <div className="overflow-hidden rounded-xl border border-line bg-ink-950">
        <p className="border-b border-line px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-fg-faint">
          미리보기
        </p>
        <div className="relative px-6 py-10">
          {cfg.eyebrow && (
            <p className="mb-3 flex items-center gap-2 font-display text-[0.65rem] uppercase tracking-[0.3em] text-beam-300/90">
              <span className="size-1.5 rounded-full bg-beam-400" />
              {cfg.eyebrow}
            </p>
          )}
          <h2 className="font-display text-5xl font-extrabold text-white text-glow">
            {cfg.title || "—"}
          </h2>
          {cfg.description && (
            <p className="mt-3 max-w-xl text-sm text-fg-muted">
              {cfg.description}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            {cfg.primaryCta.label && (
              <span className="rounded-lg bg-beam-500 px-4 py-2 text-sm font-medium text-ink-950">
                {cfg.primaryCta.label} →
              </span>
            )}
            {cfg.secondaryCta.label && (
              <span className="rounded-lg border border-line-strong px-4 py-2 text-sm text-fg">
                {cfg.secondaryCta.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* form */}
      <div className="space-y-4 rounded-xl border border-line bg-ink-900/50 p-5">
        <Field label="태그라인 (eyebrow)">
          <input
            value={cfg.eyebrow}
            onChange={(e) => set({ eyebrow: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="제목 (큰 로고 텍스트)">
          <input
            value={cfg.title}
            onChange={(e) => set({ title: e.target.value })}
            className={`${inputCls} font-display text-lg tracking-wider`}
          />
        </Field>
        <Field label="설명">
          <textarea
            value={cfg.description}
            onChange={(e) => set({ description: e.target.value })}
            rows={3}
            className={`${inputCls} resize-y`}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="rounded-lg border border-line p-3">
            <legend className="px-1 text-xs text-beam-300">기본 버튼</legend>
            <Field label="라벨">
              <input
                value={cfg.primaryCta.label}
                onChange={(e) => setCta("primaryCta", { label: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="링크">
              <input
                value={cfg.primaryCta.href}
                onChange={(e) => setCta("primaryCta", { href: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </Field>
          </fieldset>
          <fieldset className="rounded-lg border border-line p-3">
            <legend className="px-1 text-xs text-beam-300">보조 버튼</legend>
            <Field label="라벨">
              <input
                value={cfg.secondaryCta.label}
                onChange={(e) =>
                  setCta("secondaryCta", { label: e.target.value })
                }
                className={inputCls}
              />
            </Field>
            <Field label="링크">
              <input
                value={cfg.secondaryCta.href}
                onChange={(e) =>
                  setCta("secondaryCta", { href: e.target.value })
                }
                className={`${inputCls} font-mono`}
              />
            </Field>
          </fieldset>
        </div>
        <p className="text-xs text-fg-faint">
          라벨을 비우면 해당 요소는 숨겨집니다.
        </p>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-line bg-ink-850 px-3 py-2 text-sm text-fg outline-none focus:border-beam-500/60";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-2 flex flex-col gap-1 text-xs text-fg-faint first:mt-0">
      {label}
      {children}
    </label>
  );
}
