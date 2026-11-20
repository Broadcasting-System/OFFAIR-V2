import fs from "node:fs";
import path from "node:path";
import { readConfig } from "@/lib/store/config";
import { forbidden, handle, json, unauthorized } from "@/lib/wiki/http";
import { readOnairStatus } from "./status";
import { startOnair, type StartDeps } from "./start";
import { canStartOnair, canViewOnair, onairViewer, type OnairWho } from "./viewer";

/**
 * GET  /api/onair/status — 부원 이상. 세 부분의 켜짐/꺼짐과 서버 health
 * POST /api/onair/start  — 부장·최고 관리자. 'ONAIR 시작.cmd' 실행 (같은 사이트에서 온 요청만)
 * app/api/onair/** 의 route.ts 는 이 함수들을 부르기만 한다 (테스트가 deps 를 바꿔 끼울 수 있게).
 */

function requireView(who: OnairWho): void {
  if (!who.viewer.authenticated) throw unauthorized();
  if (!canViewOnair(who.viewer)) throw forbidden("방송부 부원만 볼 수 있어요.");
}

export function status(req: Request, deps: StartDeps = {}): Promise<Response> {
  return handle(req, async () => {
    const who = await onairViewer(req);
    requireView(who);
    const s = await readOnairStatus(deps);
    return json({
      ...s,
      canStart: canStartOnair(who.viewer),
      /** 이 OFFAIR 가 ONAIR 를 켤 수 있는 곳(Windows 서버 PC)인가 */
      startSupported: (deps.platform ?? process.platform) === "win32",
      /** 최근 기록으로 신원을 정했나 (ONAIR 서버가 꺼져 있어서) */
      identity: who.fallback ? "recent" : "onair",
    });
  });
}

/**
 * 다시 켜기는 브라우저 화면에서 누른 것만 받는다.
 * handle() 이 Origin 이 다른 사이트면 이미 막지만, 여기서는 Origin 이 아예 없는 요청(스크립트·curl)도
 * 막고, 브라우저가 붙이는 Sec-Fetch-Site 가 있으면 same-origin 이어야 한다.
 */
function requireSameOrigin(req: Request): void {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") throw forbidden("다른 사이트에서 온 요청은 받지 않습니다.");
  if (!req.headers.get("origin")) throw forbidden("OFFAIR 화면에서 눌러 주세요.");
}

function audit(line: string): void {
  try {
    const cfg = readConfig();
    if (cfg.readOnly) return;
    const dir = path.join(cfg.dataDir, "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "onair-start.log"), `[${new Date().toISOString()}] ${line}\n`, "utf8");
  } catch {
    /* 기록 실패는 무시 */
  }
}

export function start(req: Request, deps: StartDeps = {}): Promise<Response> {
  return handle(req, async () => {
    requireSameOrigin(req);
    const who = await onairViewer(req);
    requireView(who);
    if (!canStartOnair(who.viewer)) throw forbidden("ONAIR 다시 켜기는 부장·최고 관리자만 할 수 있어요.");
    const v = who.viewer;
    const by = `${v.name}(${v.memberId ?? "-"}, ${v.role}${who.fallback ? ", 최근 기록" : ""})`;
    try {
      const result = await startOnair(deps);
      audit(`${by} 실행: ${result.launched.script} — 켤 것: ${result.starting.join(", ")}`);
      console.info(`[offair] ONAIR 다시 켜기 — ${by}: ${result.starting.join(", ")}`);
      return json(result, { status: 202 });
    } catch (e) {
      audit(`${by} 거절·실패: ${(e as Error).message}`);
      throw e;
    }
  });
}
