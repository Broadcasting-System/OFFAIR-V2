import path from "node:path";
import { CommentStore } from "./comments";
import { readConfig, type StoreConfig } from "./config";
import { StoreError } from "./errors";
import { isInside } from "./paths";
import { Pusher } from "./push";
import { Space, type SpaceId, type SpaceLayout } from "./space";

export { Space } from "./space";
export type * from "./space";
export { StoreError, isStoreError } from "./errors";
export { readConfig } from "./config";
export type { StoreConfig } from "./config";

/** 기존 lib/content.ts 의 기본 카테고리 순서 */
export const DEFAULT_GUIDE_CATEGORIES = ["시작하기", "장비", "송출", "음향", "조명·영상", "운영"];

export const SPACE_IDS: SpaceId[] = ["guide", "members"];

export function isSpaceId(s: unknown): s is SpaceId {
  return s === "guide" || s === "members";
}

export interface Store {
  config: StoreConfig;
  guide: Space;
  /** 데이터 폴더 위치가 위험하면 null (부원 공간 사용 불가) */
  members: Space | null;
  membersProblem: string | null;
  comments: CommentStore;
  pusher: Pusher;
}

function layoutFor(id: SpaceId, cfg: StoreConfig): SpaceLayout {
  const common = {
    readOnly: cfg.readOnly,
    commit: cfg.commit,
    git: {
      bin: cfg.gitBin,
      committerName: cfg.committerName,
      committerEmail: cfg.committerEmail,
      emailDomain: cfg.emailDomain,
    },
    upload: cfg.upload,
  };
  if (id === "guide") {
    return {
      id,
      root: cfg.guideRepo,
      docsDir: "content/docs",
      sidebarFile: "content/sidebar.json",
      uploadsDir: "public/uploads",
      uploadsUrl: "/uploads",
      urlPrefix: "/docs",
      defaultCategories: DEFAULT_GUIDE_CATEGORIES,
      ownRoot: false,
      ...common,
    };
  }
  return {
    id,
    root: path.join(/*turbopackIgnore: true*/ cfg.dataDir, "members"),
    docsDir: "docs",
    sidebarFile: "sidebar.json",
    uploadsDir: "uploads",
    uploadsUrl: "/api/wiki/members/files",
    urlPrefix: "/members",
    defaultCategories: [],
    ownRoot: true,
    ...common,
  };
}

/**
 * 데이터 폴더가 공개 저장소의 빌드·공개 경로 안에 있으면 부원 문서가 새어 나갈 수 있다.
 * (public/ 은 그대로 서빙되고, content/·app/ 은 빌드에 들어간다)
 */
function checkDataDir(cfg: StoreConfig): string | null {
  const data = path.resolve(/*turbopackIgnore: true*/ cfg.dataDir);
  const repo = path.resolve(/*turbopackIgnore: true*/ cfg.guideRepo);
  if (data === repo) return "OFFAIR_DATA_DIR 가 공개 저장소 루트와 같습니다.";
  if (isInside(data, repo)) return "OFFAIR_DATA_DIR 가 공개 저장소를 품고 있습니다.";
  for (const d of ["public", "content", "app", "components", "lib", ".next"]) {
    const danger = path.join(/*turbopackIgnore: true*/ repo, d);
    if (data === danger || isInside(danger, data)) {
      return `OFFAIR_DATA_DIR 가 공개 저장소의 ${d}/ 안에 있습니다 — 부원 문서가 공개될 수 있어 막았습니다.`;
    }
  }
  return null;
}

function build(cfg: StoreConfig): Store {
  const guide = new Space(layoutFor("guide", cfg));
  const problem = checkDataDir(cfg);
  if (problem) console.error("[offair]", problem);
  const members = problem ? null : new Space(layoutFor("members", cfg));
  const pusher = new Pusher(guide.git, cfg.push, path.join(/*turbopackIgnore: true*/ cfg.dataDir, "logs", "push.log"));
  guide.onCommit = () => pusher.schedule();
  // 서버가 다시 켜졌을 때 못 올린 커밋이 남아 있을 수 있으니 한 번 시도
  if (cfg.push.enabled && !cfg.readOnly && process.env.NEXT_PHASE !== "phase-production-build") {
    pusher.schedule();
  }
  return {
    config: cfg,
    guide,
    members,
    membersProblem: problem,
    comments: new CommentStore(cfg.dataDir),
    pusher,
  };
}

const g = globalThis as unknown as { __offairStore?: { key: string; store: Store } };

/** 지금 환경 변수 기준의 저장소. 설정이 같으면 같은 객체(캐시·push 예약 공유) */
export function getStore(): Store {
  const cfg = readConfig();
  const key = JSON.stringify(cfg);
  if (!g.__offairStore || g.__offairStore.key !== key) {
    g.__offairStore = { key, store: build(cfg) };
  }
  return g.__offairStore.store;
}

export function getSpace(id: SpaceId): Space {
  const store = getStore();
  if (id === "guide") return store.guide;
  if (!store.members) {
    throw new StoreError("unavailable", store.membersProblem ?? "부원 공간을 쓸 수 없습니다.");
  }
  return store.members;
}

/** 테스트용 — 다음 getStore() 가 env 를 다시 읽어 새로 만든다 */
export function resetStoreForTests(): void {
  delete g.__offairStore;
}
