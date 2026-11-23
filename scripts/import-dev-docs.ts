/**
 * 개발 문서(members 공간) 씨앗 가져오기 — 한 번 돌리고 끝나는 도구.
 *
 *   npm run import:dev-docs -- <씨앗 폴더> [--dry-run] [--overwrite]
 *   node --import tsx scripts/import-dev-docs.ts <씨앗 폴더>
 *
 * 씨앗 폴더를 안 주면 env OFFAIR_DEV_DOCS_SEED. 위키 서버와 같은 OFFAIR_DATA_DIR 로 돌려야 한다
 * (서버 PC 에서는 'OFFAIR 시작.cmd' 가 같은 env 로 위키를 켜기 전에 부른다).
 * 규칙은 lib/store/import-docs.ts (바뀐 것만, 지우지 않음, 위키에서 고친 문서는 그대로, 한 커밋).
 *
 * 종료 코드: 0 = 끝남(건너뛴 문서가 있어도), 1 = 실패, 2 = 사용법 오류
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getStore } from "@/lib/store";
import { describeSeed, importDocs } from "@/lib/store/import-docs";

const MARK: Record<string, string> = { added: "+", updated: "~", unchanged: "=", skipped: "!" };
const WORD: Record<string, string> = { added: "새로", updated: "바꿈", unchanged: "같음", skipped: "건너뜀" };

function gitHead(dir: string): string | null {
  try {
    return execFileSync(process.env.OFFAIR_GIT_BIN || "git", ["-C", dir, "log", "-1", "--format=%h"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim() || null;
  } catch {
    return null;
  }
}

async function main(argv: string[]): Promise<number> {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const args = argv.filter((a) => !a.startsWith("--"));
  for (const f of flags) {
    if (f !== "--dry-run" && f !== "--overwrite" && f !== "--help") {
      console.error(`모르는 옵션: ${f}`);
      return 2;
    }
  }
  const seed = args[0] || process.env.OFFAIR_DEV_DOCS_SEED || "";
  if (flags.has("--help") || !seed) {
    console.error("사용법: npm run import:dev-docs -- <씨앗 폴더> [--dry-run] [--overwrite]  (또는 env OFFAIR_DEV_DOCS_SEED)");
    return 2;
  }
  const dir = path.resolve(seed);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`씨앗 폴더가 없어요: ${dir}`);
    return 1;
  }

  // 가이드북 저장소는 건드리지 않는다 (서버 env 를 그대로 써도 push 예약이 생기지 않게)
  process.env.OFFAIR_GIT_PUSH = "0";
  const store = getStore();
  if (!store.members) {
    console.error(`개발 문서 공간을 쓸 수 없어요: ${store.membersProblem ?? "OFFAIR_DATA_DIR 확인"}`);
    return 1;
  }
  const dryRun = flags.has("--dry-run");
  console.log(`씨앗: ${dir}`);
  console.log(`대상: ${store.members.layout.root}${dryRun ? " (시험, 쓰지 않음)" : ""}`);

  const report = await importDocs(store.members, dir, {
    dryRun,
    overwrite: flags.has("--overwrite"),
    source: describeSeed(dir, gitHead(dir)),
  });
  for (const i of report.items) {
    const name = i.slug || i.file;
    console.log(`${MARK[i.action]} ${WORD[i.action]}  ${name}${i.title ? `  「${i.title}」` : ""}${i.reason ? `  ${i.reason}` : ""}`);
  }
  if (report.categoriesAdded.length) console.log(`카테고리 추가: ${report.categoriesAdded.join(", ")}`);
  console.log(
    `끝: 새로 ${report.added} · 바꿈 ${report.updated} · 같음 ${report.unchanged} · 건너뜀 ${report.skipped}` +
      (report.commit ? ` · 커밋 ${report.commit.slice(0, 7)}` : dryRun ? "" : " · 커밋 없음")
  );
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(`가져오기 실패: ${(e as Error).message}`);
    process.exit(1);
  }
);
