/**
 * 서버가 켜질 때 한 번. 요청마다 실제 소켓 주소를 붙여 둔다 (lib/wiki/peer.ts —
 * CUE 같은 같은 PC 서비스의 읽기 전용 접근을 127.0.0.1 에서 온 것만 받으려고).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installPeerStamp } = await import("@/lib/wiki/peer");
  await installPeerStamp();
}
