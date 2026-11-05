import fs from "node:fs";
import path from "node:path";
import type { Git } from "./git";
import { repoMutex } from "./mutex";

/**
 * 공개 저장소 자동 push. 저장(커밋)이 생기면 debounce 뒤 한 번에:
 *   git pull --rebase --autostash <remote> <branch>  →  git push <remote> HEAD:<branch>
 * 실패하면 로그를 남기고 점점 길게 기다렸다 다시 시도한다. 저장은 절대 막지 않는다.
 * 부원 공간에는 붙이지 않는다.
 */

export interface PushConfig {
  enabled: boolean;
  remote: string;
  branch: string;
  debounceMs: number;
  maxBackoffMs: number;
}

export interface PushStatus {
  enabled: boolean;
  remote: string;
  branch: string;
  pending: boolean;
  running: boolean;
  failures: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  nextAttemptAt: string | null;
}

export class Pusher {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private state: Omit<PushStatus, "enabled" | "remote" | "branch"> = {
    pending: false,
    running: false,
    failures: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    nextAttemptAt: null,
  };

  constructor(
    private readonly git: Git,
    private readonly cfg: PushConfig,
    private readonly logFile: string | null
  ) {}

  status(): PushStatus {
    return { enabled: this.cfg.enabled, remote: this.cfg.remote, branch: this.cfg.branch, ...this.state };
  }

  /** 커밋 뒤 부른다. 이미 예약돼 있으면 다시 미룬다 (debounce) */
  schedule(delayMs = this.cfg.debounceMs): void {
    if (!this.cfg.enabled) return;
    this.state.pending = true;
    if (this.timer) clearTimeout(this.timer);
    this.state.nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pushNow();
    }, delayMs);
    // 테스트·종료를 붙잡지 않게
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** 지금 바로 (예약은 지운다). 결과 상태를 돌려준다 */
  async pushNow(): Promise<PushStatus> {
    if (!this.cfg.enabled) return this.status();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state.nextAttemptAt = null;
    if (this.state.running) return this.status();
    this.state.running = true;
    this.state.lastAttemptAt = new Date().toISOString();
    try {
      await repoMutex.run(this.git.dir, async () => {
        const branch = this.cfg.branch || (await this.git.currentBranch());
        const pull = await this.git.run(
          ["pull", "--rebase", "--autostash", "--no-edit", this.cfg.remote, branch],
          { allowFail: true, timeoutMs: 120_000 }
        );
        if (pull.code !== 0) {
          await this.git.run(["rebase", "--abort"], { allowFail: true });
          throw new Error(`pull 실패: ${(pull.stderr || pull.stdout).trim()}`);
        }
        const push = await this.git.run(["push", this.cfg.remote, `HEAD:${branch}`], {
          allowFail: true,
          timeoutMs: 120_000,
        });
        if (push.code !== 0) throw new Error(`push 실패: ${(push.stderr || push.stdout).trim()}`);
      });
      this.state.pending = false;
      this.state.failures = 0;
      this.state.lastError = null;
      this.state.lastSuccessAt = new Date().toISOString();
      this.log("ok");
    } catch (e) {
      this.state.failures += 1;
      this.state.lastError = (e as Error).message.slice(0, 2000);
      this.log(`실패(${this.state.failures}회): ${this.state.lastError}`);
      const wait = Math.min(
        this.cfg.maxBackoffMs,
        Math.max(30_000, this.cfg.debounceMs) * 2 ** Math.min(this.state.failures - 1, 10)
      );
      this.state.running = false;
      this.schedule(wait);
      return this.status();
    }
    this.state.running = false;
    return this.status();
  }

  private log(msg: string) {
    const line = `${new Date().toISOString()} [push ${this.cfg.remote}] ${msg}`;
    if (msg !== "ok") console.warn("[offair]", line);
    if (!this.logFile) return;
    try {
      fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
      fs.appendFileSync(this.logFile, line + "\n", "utf8");
    } catch {
      /* 로그 실패는 무시 */
    }
  }
}
