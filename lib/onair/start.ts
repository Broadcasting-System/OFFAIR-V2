import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { HttpError } from "@/lib/wiki/http";
import { readOnairStatus, type OnairStatus, type StatusDeps } from "./status";

/**
 * 'ONAIR 다시 켜기' — 서버 PC 바탕화면의 'ONAIR 시작.cmd' 를 실행한다.
 *
 * 그 스크립트는 꺼진 포트만 켜고(이미 열린 포트는 건너뜀) 각 앱을 "꺼지면 5초 뒤 다시 켜기" 창으로
 * 띄운다. 그래서 여러 번 눌러도 켜져 있는 것을 다시 켜지 않는다.
 *
 * 실행은 반드시 `explorer.exe "<경로>"` 로 한다:
 *  - OFFAIR 프로세스 트리에서 떨어져 나간다 (OFFAIR 가 다시 켜져도 ONAIR 가 같이 꺼지지 않음)
 *  - 이미 떠 있는 사용자 셸(탐색기)이 대신 열어 주므로, OFFAIR 가 관리자 권한으로 돌더라도 ONAIR 는
 *    보통 권한으로 켜진다. (예전에 관리자 권한으로 켜진 ONAIR 때문에 업데이트 스크립트가 깨진 적이 있다)
 */

export const SCRIPT_NAME = "ONAIR 시작.cmd";

type Env = Record<string, string | undefined>;

export interface StartDeps extends StatusDeps {
  platform?: NodeJS.Platform;
  /** 'ONAIR 시작.cmd' 의 전체 경로. 못 찾으면 null */
  findScript?: () => Promise<string | null>;
  /** 스크립트를 떼어 내 실행 */
  launch?: (script: string) => Promise<void>;
}

export interface StartResult {
  ok: true;
  launched: { script: string; via: "explorer.exe" };
  /** 이번에 켜질 부분 (꺼져 있던 것) */
  starting: string[];
  status: OnairStatus;
}

/* ───────────── 바탕화면·스크립트 찾기 ───────────── */

/** 찾아볼 경로들 (앞에서부터). desktop 은 [Environment]::GetFolderPath('Desktop') 결과 */
export function scriptCandidates(desktop: string | null, env: Env = process.env): string[] {
  const w = path.win32;
  if (env.ONAIR_START_SCRIPT) return [env.ONAIR_START_SCRIPT];
  const dirs: string[] = [];
  if (desktop) dirs.push(desktop);
  const home = env.USERPROFILE;
  if (home) {
    dirs.push(w.join(home, "Desktop"));
    // OneDrive 로 옮겨진 바탕화면 (영문·한글 이름)
    const od = env.OneDrive || env.ONEDRIVE || w.join(home, "OneDrive");
    dirs.push(w.join(od, "Desktop"), w.join(od, "바탕 화면"));
  }
  return [...new Set(dirs.map((d) => w.join(d, SCRIPT_NAME)))];
}

/** 이 계정의 바탕화면 폴더 (OneDrive 로 옮겨졌어도). PowerShell 한 번, 한글 깨짐 없게 base64 로 받는다 */
export function windowsDesktop(): Promise<string | null> {
  const cmd = "[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([Environment]::GetFolderPath('Desktop')))";
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmd],
      { timeout: 10_000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const p = Buffer.from(String(stdout).trim(), "base64").toString("utf8").trim();
          resolve(p || null);
        } catch {
          resolve(null);
        }
      }
    );
  });
}

export async function findStartScript(
  getDesktop: () => Promise<string | null> = windowsDesktop,
  exists: (p: string) => boolean = (p) => fs.existsSync(p),
  env: Env = process.env
): Promise<string | null> {
  const desktop = env.ONAIR_START_SCRIPT ? null : await getDesktop().catch(() => null);
  return scriptCandidates(desktop, env).find((p) => exists(p)) ?? null;
}

/** explorer.exe 로 떼어 내 실행. explorer 는 성공해도 종료 코드가 1 이라 코드는 보지 않는다 */
export function launchViaExplorer(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("explorer.exe", [script], { detached: true, stdio: "ignore", windowsHide: false });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/* ───────────── 너무 잦은 누름 막기 ───────────── */

const g = globalThis as unknown as { __offairOnairStart?: { lastAt: number; busy: boolean } };
const limiter = (g.__offairOnairStart ??= { lastAt: 0, busy: false });

export function resetStartLimitForTests(): void {
  limiter.lastAt = 0;
  limiter.busy = false;
}

function gapMs(): number {
  const n = Number(process.env.OFFAIR_ONAIR_START_GAP_MS);
  return Number.isFinite(n) && n >= 0 ? n : 60_000;
}

/* ───────────── 켜기 ───────────── */

export async function startOnair(deps: StartDeps = {}): Promise<StartResult> {
  const platform = deps.platform ?? process.platform;
  if (platform !== "win32") {
    throw new HttpError(501, "not_windows", "ONAIR 다시 켜기는 방송실 서버 PC(Windows)에서 도는 OFFAIR 에서만 돼요.");
  }
  const now = deps.now ?? Date.now;
  if (limiter.busy) throw new HttpError(429, "busy", "지금 켜는 중이에요. 잠시 뒤에 다시 확인해 주세요.", { retryAfter: 5 });
  const wait = limiter.lastAt + gapMs() - now();
  if (wait > 0) {
    const retryAfter = Math.max(1, Math.ceil(wait / 1000));
    throw new HttpError(429, "too_soon", `방금 켰어요. ${retryAfter}초 뒤에 다시 누를 수 있어요.`, { retryAfter });
  }
  limiter.busy = true;
  try {
    const status = await readOnairStatus(deps);
    if (status.allUp) throw new HttpError(409, "already_up", "이미 다 켜져 있어요.", { status });
    const script = await (deps.findScript ?? (() => findStartScript()))();
    if (!script) {
      throw new HttpError(503, "no_script", `바탕화면에서 '${SCRIPT_NAME}' 을 찾지 못했어요. 서버 PC 에 원격으로 들어가 확인해 주세요.`);
    }
    try {
      await (deps.launch ?? launchViaExplorer)(script);
    } catch (e) {
      throw new HttpError(500, "launch_failed", `'${SCRIPT_NAME}' 을 실행하지 못했어요: ${(e as Error).message}`);
    }
    limiter.lastAt = now();
    return {
      ok: true,
      launched: { script, via: "explorer.exe" },
      starting: status.apps.filter((a) => !a.up).map((a) => a.name),
      status,
    };
  } finally {
    limiter.busy = false;
  }
}
