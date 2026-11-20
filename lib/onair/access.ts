import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readConfig } from "@/lib/store/config";
import type { Role, Viewer } from "@/lib/wiki/auth";

/**
 * ONAIR 가 꺼져 있을 때도 "누가 누르는지" 알기 위한 장치.
 *
 * 평소 신원은 ONAIR(`/api/members/me`)가 정한다(lib/wiki/auth.ts). 그런데 ONAIR 서버가 통째로
 * 꺼지면 모두 손님이 되어, 정작 'ONAIR 다시 켜기' 단추를 누를 사람이 없어진다. 그래서
 *
 * 1. ONAIR 가 어떤 Access 토큰을 부원으로 확인해 줄 때마다, 그 토큰 안의 이메일·발급자(iss)·AUD 와
 *    ONAIR 가 알려 준 역할을 데이터 폴더의 `onair-access.json` 에 적어 둔다.
 *    (ONAIR 가 서명·AUD 를 이미 확인한 토큰이므로 안의 값을 믿을 수 있다)
 * 2. ONAIR 가 답하지 않을 때만, 요청의 Access 토큰을 여기서 직접 확인한다 — Cloudflare 의 공개 키
 *    (`<팀>.cloudflareaccess.com/cdn-cgi/access/certs`)로 RS256 서명, 발급자, AUD, 만료를 본다.
 *    발급자·AUD 는 1에서 배운 값(또는 env `OFFAIR_ACCESS_TEAM`·`OFFAIR_ACCESS_AUD`)만 쓴다.
 * 3. 확인된 이메일이 적어 둔 명단에 있고, 마지막으로 확인된 지 `OFFAIR_ACCESS_ROSTER_DAYS`(기본 30일)
 *    안이면 그 역할로 본다.
 *
 * 이 결과는 ONAIR 상태 화면·다시 켜기에서만 쓴다. 위키 읽기·쓰기 권한은 그대로 ONAIR 만 따른다.
 */

const FILE = "onair-access.json";
const LEEWAY_S = 30;
const KEYS_TTL_MS = 60 * 60 * 1000;
const REFETCH_GAP_MS = 60 * 1000;
const TOUCH_GAP_MS = 10 * 60 * 1000;
const MAX_AUDIENCES = 8;
/** 명단에 남기는 역할 — ONAIR 화면을 쓸 수 있는 사람만 */
const ROSTER_ROLES: Role[] = ["member", "lead", "superadmin"];
const ISSUER_RE = /^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.cloudflareaccess\.com$/;

export interface RosterEntry {
  role: Role;
  name: string;
  memberId: string | null;
  cohort: string | null;
  roleLabel: string | null;
  /** 마지막으로 ONAIR 가 확인해 준 때 (ms) */
  seenAt: number;
}

export interface Roster {
  version: 1;
  issuer: string | null;
  audiences: string[];
  people: Record<string, RosterEntry>;
}

const emptyRoster = (): Roster => ({ version: 1, issuer: null, audiences: [], people: {} });

/* ───────────── JWT ───────────── */

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
}

export function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p || !/^[A-Za-z0-9_-]+$/.test(p))) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!header || typeof header !== "object" || !payload || typeof payload !== "object") return null;
    return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature: Buffer.from(parts[2], "base64url") };
  } catch {
    return null;
  }
}

/** 'myteam' · 'myteam.cloudflareaccess.com' · 'https://myteam.cloudflareaccess.com/' → https://myteam.cloudflareaccess.com */
export function teamIssuer(team: string): string | null {
  let host = (team || "").trim().replace(/\/+$/, "").replace(/^https?:\/\//i, "").toLowerCase();
  if (!host) return null;
  if (!host.includes(".")) host = `${host}.cloudflareaccess.com`;
  const iss = `https://${host}`;
  return ISSUER_RE.test(iss) ? iss : null;
}

function audList(aud: unknown): string[] {
  if (typeof aud === "string") return aud ? [aud] : [];
  if (Array.isArray(aud)) return aud.filter((a): a is string => typeof a === "string" && !!a);
  return [];
}

function emailOf(payload: Record<string, unknown>): string | null {
  const e = payload.email;
  if (typeof e !== "string") return null;
  const v = e.trim().toLowerCase();
  return v && v.length <= 254 && v.includes("@") ? v : null;
}

/* ───────────── 서명 키 (Cloudflare Access certs) ───────────── */

interface KeySet {
  issuer: string;
  keys: Map<string, crypto.KeyObject>;
  fetchedAt: number;
}
const g = globalThis as unknown as { __offairAccessKeys?: KeySet | null; __offairRoster?: { file: string; roster: Roster } | null };

export function clearAccessStateForTests(): void {
  g.__offairAccessKeys = null;
  g.__offairRoster = null;
}

async function fetchKeys(issuer: string): Promise<Map<string, crypto.KeyObject>> {
  const res = await fetch(`${issuer}/cdn-cgi/access/certs`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const data = (await res.json()) as { keys?: Record<string, unknown>[] };
  const keys = new Map<string, crypto.KeyObject>();
  for (const k of data?.keys ?? []) {
    try {
      if (k.kty === "RSA" && typeof k.kid === "string") keys.set(k.kid, crypto.createPublicKey({ key: k as crypto.JsonWebKey, format: "jwk" }));
    } catch {
      /* 깨진 키 하나는 건너뛴다 */
    }
  }
  if (!keys.size) throw new Error("certs 에 RSA 키가 없음");
  return keys;
}

async function keyFor(issuer: string, kid: string, now: number): Promise<crypto.KeyObject | null> {
  let set = g.__offairAccessKeys;
  if (set && set.issuer !== issuer) set = null;
  const stale = !set || now - set.fetchedAt > KEYS_TTL_MS;
  const unknown = !!set && !set.keys.has(kid) && now - set.fetchedAt > REFETCH_GAP_MS;
  if (stale || unknown) {
    try {
      set = g.__offairAccessKeys = { issuer, keys: await fetchKeys(issuer), fetchedAt: now };
    } catch (e) {
      console.warn("[offair] Cloudflare Access 키를 받지 못함:", (e as Error).message);
      // 갖고 있는 키로는 계속 확인한다
    }
  }
  return set?.keys.get(kid) ?? null;
}

/**
 * Access 토큰을 직접 확인한다. 맞으면 claims, 아니면 null.
 * RS256 서명 · iss 가 issuer 와 같음 · aud 가 audiences 중 하나 · exp/nbf (30초 여유).
 */
export async function verifyAccessToken(
  token: string,
  opts: { issuer: string; audiences: string[]; now?: number }
): Promise<Record<string, unknown> | null> {
  const d = decodeJwt(token);
  if (!d) return null;
  if (d.header.alg !== "RS256" || typeof d.header.kid !== "string") return null;
  const now = opts.now ?? Date.now();
  const p = d.payload;
  if (p.iss !== opts.issuer) return null;
  if (!audList(p.aud).some((a) => opts.audiences.includes(a))) return null;
  const sec = now / 1000;
  if (typeof p.exp !== "number" || p.exp + LEEWAY_S < sec) return null;
  if (typeof p.nbf === "number" && p.nbf - LEEWAY_S > sec) return null;
  const key = await keyFor(opts.issuer, d.header.kid, now);
  if (!key) return null;
  const ok = crypto.verify("RSA-SHA256", Buffer.from(d.signingInput), key, d.signature);
  return ok ? p : null;
}

/* ───────────── 명단 파일 ───────────── */

function rosterFile(): string | null {
  const cfg = readConfig();
  if (cfg.readOnly) return null;
  return path.join(cfg.dataDir, FILE);
}

export function loadRoster(): Roster {
  const file = rosterFile();
  if (!file) return emptyRoster();
  if (g.__offairRoster?.file === file) return g.__offairRoster.roster;
  let roster = emptyRoster();
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Roster>;
    roster = {
      version: 1,
      issuer: typeof j.issuer === "string" && ISSUER_RE.test(j.issuer) ? j.issuer : null,
      audiences: audList(j.audiences).slice(0, MAX_AUDIENCES),
      people: j.people && typeof j.people === "object" ? (j.people as Record<string, RosterEntry>) : {},
    };
  } catch {
    /* 없거나 깨짐 → 빈 명단 */
  }
  g.__offairRoster = { file, roster };
  return roster;
}

function saveRoster(roster: Roster): void {
  const file = rosterFile();
  if (!file) return;
  g.__offairRoster = { file, roster };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(roster, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (e) {
    console.warn("[offair] ONAIR 부원 기록을 저장하지 못함:", (e as Error).message);
  }
}

/**
 * ONAIR 가 이 토큰을 확인해 준 뒤 부른다 (lib/wiki/auth.ts). 실패해도 요청에는 영향이 없다.
 * ONAIR 화면을 쓸 수 있는 역할(부원 이상)만, 이메일이 있는 사람 토큰만 적는다. 다른 역할로 확인되면 지운다.
 */
export function rememberAccess(token: string, viewer: Viewer, now = Date.now()): void {
  try {
    // 손님 답은 토큰이 확인되지 않았을 수도 있어 안의 이메일을 믿지 않는다 → 아무것도 하지 않음
    if (viewer.source !== "onair" || viewer.role === "guest") return;
    const d = decodeJwt(token);
    if (!d) return;
    const email = emailOf(d.payload);
    const issuer = typeof d.payload.iss === "string" && ISSUER_RE.test(d.payload.iss) ? d.payload.iss : null;
    if (!email || !issuer) return;
    const roster = loadRoster();
    if (!ROSTER_ROLES.includes(viewer.role)) {
      // 졸업생·교사가 된 사람은 명단에서 뺀다
      if (roster.people[email]) {
        const people = { ...roster.people };
        delete people[email];
        saveRoster({ ...roster, people });
      }
      return;
    }
    const prev = roster.people[email];
    const entry: RosterEntry = {
      role: viewer.role,
      name: viewer.name,
      memberId: viewer.memberId,
      cohort: viewer.cohort ?? null,
      roleLabel: viewer.roleLabel ?? null,
      seenAt: now,
    };
    const auds = audList(d.payload.aud);
    const sameEntry =
      prev &&
      prev.role === entry.role &&
      prev.name === entry.name &&
      prev.memberId === entry.memberId &&
      prev.cohort === entry.cohort &&
      prev.roleLabel === entry.roleLabel &&
      now - prev.seenAt < TOUCH_GAP_MS;
    const sameKeys = roster.issuer === issuer && auds.every((a) => roster.audiences.includes(a));
    if (sameEntry && sameKeys) return;
    const audiences = [...auds, ...roster.audiences.filter((a) => !auds.includes(a))].slice(0, MAX_AUDIENCES);
    saveRoster({ version: 1, issuer, audiences, people: { ...roster.people, [email]: entry } });
  } catch (e) {
    console.warn("[offair] ONAIR 부원 기록 실패:", (e as Error).message);
  }
}

function maxAgeMs(): number {
  const n = Number(process.env.OFFAIR_ACCESS_ROSTER_DAYS);
  return (Number.isFinite(n) && n > 0 ? n : 30) * 24 * 60 * 60 * 1000;
}

/** 확인할 발급자·AUD — env 가 있으면 그것, 없으면 ONAIR 가 확인해 준 토큰에서 배운 값 */
export function accessSettings(roster = loadRoster()): { issuer: string | null; audiences: string[] } {
  const envIss = process.env.OFFAIR_ACCESS_TEAM ? teamIssuer(process.env.OFFAIR_ACCESS_TEAM) : null;
  const envAud = (process.env.OFFAIR_ACCESS_AUD || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { issuer: envIss ?? roster.issuer, audiences: envAud.length ? envAud : roster.audiences };
}

/**
 * ONAIR 가 답하지 않을 때만 부른다. 토큰이 맞고 명단에 있으면 그 사람, 아니면 null.
 */
export async function fallbackViewer(token: string, now = Date.now()): Promise<Viewer | null> {
  try {
    const roster = loadRoster();
    const { issuer, audiences } = accessSettings(roster);
    if (!issuer || !audiences.length) return null;
    const claims = await verifyAccessToken(token, { issuer, audiences, now });
    if (!claims) return null;
    const email = emailOf(claims);
    const e = email ? roster.people[email] : undefined;
    if (!e || !ROSTER_ROLES.includes(e.role) || now - e.seenAt > maxAgeMs()) return null;
    return {
      role: e.role,
      name: e.name,
      memberId: e.memberId,
      authenticated: true,
      cohort: e.cohort,
      roleLabel: e.roleLabel,
      source: "roster",
    };
  } catch (err) {
    console.warn("[offair] Access 토큰 직접 확인 실패:", (err as Error).message);
    return null;
  }
}
