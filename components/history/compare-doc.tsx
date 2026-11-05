import "server-only";
import { Fragment } from "react";
import { renderMdx } from "@/lib/mdx";
import { blockDiff, wordDiff, type DiffChunk } from "@/lib/wiki/block-diff";

/**
 * 수정 기록 비교 화면의 본문 (서버에서 그린다).
 * 지금 문서를 그대로 그리되, 예전 버전 뒤로 바뀐 곳을 표시한다:
 *  - 지운 말: 빨강 취소선(del) · 더한 말: 초록(ins)
 *  - 통째로 더한 블록: 초록 왼쪽 막대 · 통째로 지운 블록: 빨강 + 취소선
 */
export function CompareDoc({
  category,
  oldTitle,
  newTitle,
  oldDescription,
  newDescription,
  oldBody,
  newBody,
}: {
  category: string;
  oldTitle: string;
  newTitle: string;
  oldDescription: string;
  newDescription: string;
  oldBody: string;
  newBody: string;
}) {
  const chunks = blockDiff(oldBody, newBody);
  return (
    <>
      <header className="mb-[26px]">
        <span className="inline-flex rounded-full bg-accent-soft px-[9px] py-[3px] text-xs font-semibold text-accent">{category}</span>
        <h1 className="diff-inline mt-3 text-[28px] leading-[1.3] font-bold tracking-[-0.01em] text-fg sm:text-[34px]">
          <Words before={oldTitle} after={newTitle} />
        </h1>
        {(oldDescription || newDescription) && (
          <p className="diff-inline mt-2.5 text-[16px] leading-relaxed text-fg-2 sm:text-[17px]">
            <Words before={oldDescription} after={newDescription} />
          </p>
        )}
      </header>
      <div className="prose diff-prose">
        {chunks.map((c, i) => (
          <Chunk key={i} chunk={c} />
        ))}
      </div>
    </>
  );
}

function Words({ before, after }: { before: string; after: string }) {
  if (before === after) return <>{after}</>;
  return (
    <>
      {wordDiff(before, after).map((s, i) =>
        s.type === "same" ? <Fragment key={i}>{s.text}</Fragment> : s.type === "add" ? <ins key={i}>{s.text}</ins> : <del key={i}>{s.text}</del>
      )}
    </>
  );
}

/** 그리지 못한 조각은 글자 그대로 */
function Plain({ source }: { source: string }) {
  return <pre className="diff-plain">{source}</pre>;
}

async function Block({ source, cls }: { source: string; cls: string }) {
  const node = await renderMdx(source);
  return <div className={`diff-chunk ${cls}`}>{node ?? <Plain source={source} />}</div>;
}

async function Chunk({ chunk }: { chunk: DiffChunk }) {
  switch (chunk.kind) {
    case "same":
      return <Block source={chunk.source} cls="" />;
    case "added":
      return <Block source={chunk.source} cls="diff-blk diff-blk-add" />;
    case "removed":
      return <Block source={chunk.source} cls="diff-blk diff-blk-del" />;
    case "changed": {
      const node = await renderMdx(chunk.source);
      if (node) return <div className="diff-chunk">{node}</div>;
      // 표시를 끼운 원문이 깨지면: 지운 블록 + 더한 블록으로
      return (
        <>
          <Block source={chunk.oldSource} cls="diff-blk diff-blk-del" />
          <Block source={chunk.newSource} cls="diff-blk diff-blk-add" />
        </>
      );
    }
  }
}
