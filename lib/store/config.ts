import path from "node:path";

/**
 * 위키 저장소 설정 — 전부 환경 변수에서 읽는다.
 *
 * 요청마다 다시 읽어도 될 만큼 가볍다. 테스트가 env 를 바꾼 뒤
 * `resetStoreForTests()` 를 부르면 새 설정으로 공간을 다시 만든다.
 */
export interface StoreConfig {
  /** 공개(guide) 공간 = 이 저장소 자체. 기본은 현재 작업 폴더 */
  guideRepo: string;
  /** 부원 공간·댓글·업로드 기록이 들어가는 폴더 (공개 저장소에 올리지 않는다) */
  dataDir: string;
  /** 쓰기 금지 (Vercel 읽기 전용 사본 등) */
  readOnly: boolean;
  /** 저장마다 git 커밋 (기본 켬) */
  commit: boolean;
  push: {
    enabled: boolean;
    remote: string;
    /** 비우면 현재 브랜치 */
    branch: string;
    debounceMs: number;
    /** 실패 뒤 다시 시도하기까지 최대 대기 */
    maxBackoffMs: number;
  };
  /** 커밋 작성자 이메일 도메인 — `<memberId>@<domain>` */
  emailDomain: string;
  committerName: string;
  committerEmail: string;
  gitBin: string;
  upload: {
    maxImageBytes: number;
    maxFileBytes: number;
  };
}

function flag(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === "") return fallback;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): StoreConfig {
  // 경로는 env 로 정해진다 — 빌드 추적기가 프로젝트 전체를 끌어들이지 않게 무시 표시
  const cwd = process.cwd(/*turbopackIgnore: true*/);
  const mb = 1024 * 1024;
  return {
    guideRepo: path.resolve(/*turbopackIgnore: true*/ cwd, env.OFFAIR_GUIDE_REPO || "."),
    dataDir: path.resolve(/*turbopackIgnore: true*/ cwd, env.OFFAIR_DATA_DIR || ".offair-data"),
    readOnly: flag(env.OFFAIR_READONLY, Boolean(env.VERCEL)),
    commit: flag(env.OFFAIR_GIT_COMMIT, true),
    push: {
      enabled: flag(env.OFFAIR_GIT_PUSH, false),
      remote: env.OFFAIR_GIT_REMOTE || "origin",
      branch: env.OFFAIR_GIT_BRANCH || "",
      debounceMs: num(env.OFFAIR_GIT_PUSH_DEBOUNCE_MS, 30_000),
      maxBackoffMs: num(env.OFFAIR_GIT_PUSH_MAX_BACKOFF_MS, 15 * 60_000),
    },
    emailDomain: env.OFFAIR_GIT_EMAIL_DOMAIN || "members.offair.local",
    committerName: env.OFFAIR_GIT_COMMITTER_NAME || "OFFAIR Wiki",
    committerEmail: env.OFFAIR_GIT_COMMITTER_EMAIL || "wiki@offair.local",
    gitBin: env.OFFAIR_GIT_BIN || "git",
    upload: {
      maxImageBytes: num(env.OFFAIR_UPLOAD_MAX_IMAGE_MB, 10) * mb,
      maxFileBytes: num(env.OFFAIR_UPLOAD_MAX_FILE_MB, 25) * mb,
    },
  };
}
