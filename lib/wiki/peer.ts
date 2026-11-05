import crypto from "node:crypto";

/**
 * 요청이 실제로 어느 주소(소켓)에서 왔는지 — X-Forwarded-For 는 보내는 쪽이 아무렇게나 쓸 수 있어 믿지 않는다.
 *
 * Next 라우트 핸들러는 Node 소켓을 보여 주지 않으므로, 서버가 켜질 때(instrumentation.ts → register)
 * http.Server 의 'request' 이벤트를 감싸서 Next 가 요청을 읽기 전에 머리글 하나를 붙인다:
 *
 *   x-offair-peer: <소켓 주소>;<이 프로세스만 아는 난수>
 *
 * 들어온 요청에 같은 머리글이 있어도 언제나 덮어쓰고, 난수가 맞아야만 믿는다.
 * 감싸기가 안 됐으면(난수가 없으면) 아무 주소도 믿지 않는다 — 실패해도 닫힌 쪽으로.
 */

export const PEER_HEADER = "x-offair-peer";

const g = globalThis as unknown as { __offairPeerNonce?: string; __offairPeerPatched?: boolean };

function nonce(): string {
  return (g.__offairPeerNonce ??= crypto.randomBytes(18).toString("base64url"));
}

/** 머리글 값 만들기 (감싸기·테스트용) */
export function peerStamp(address: string): string {
  return `${address};${nonce()}`;
}

/** 믿을 수 있는 소켓 주소. 없거나 난수가 다르면 null */
export function peerOf(req: Request): string | null {
  const v = req.headers.get(PEER_HEADER);
  const n = g.__offairPeerNonce;
  if (!v || !n) return null;
  const i = v.lastIndexOf(";");
  if (i === -1) return null;
  const a = Buffer.from(v.slice(i + 1));
  const b = Buffer.from(n);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return v.slice(0, i) || null;
}

export function isLoopback(addr: string | null): boolean {
  if (!addr) return false;
  const a = addr.replace(/^::ffff:/i, "");
  return a === "::1" || /^127(\.\d{1,3}){3}$/.test(a);
}

/** http.Server 의 'request' 를 감싸 소켓 주소를 붙인다 (한 번만) */
export async function installPeerStamp(): Promise<void> {
  if (g.__offairPeerPatched) return;
  g.__offairPeerPatched = true;
  nonce();
  const http = await import("node:http");
  const proto = http.Server.prototype as unknown as { emit: (event: string, ...args: unknown[]) => boolean };
  const original = proto.emit;
  proto.emit = function (this: unknown, event: string, ...args: unknown[]) {
    if (event === "request") {
      const req = args[0] as { headers?: Record<string, unknown>; socket?: { remoteAddress?: string } } | undefined;
      if (req?.headers) req.headers[PEER_HEADER] = peerStamp(req.socket?.remoteAddress ?? "");
    }
    return original.call(this, event, ...args);
  };
}
