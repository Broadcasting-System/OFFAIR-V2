/**
 * "주소로" 탭 — 붙여 넣은 주소가 유튜브인지, 그림인지 가린다.
 */

export interface YouTubeRef {
  id: string;
  /** 시작 위치(초) */
  start?: number;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** "1m30s" / "90" / "1h2m3s" → 초 */
export function parseTime(t: string | null): number | undefined {
  if (!t) return undefined;
  if (/^\d+$/.test(t)) return Number(t) || undefined;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || !m[0]) return undefined;
  const s = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return s || undefined;
}

function toUrl(input: string): URL | null {
  const s = input.trim();
  if (!s) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
}

/** watch?v= / youtu.be / shorts / embed / live / m.youtube / music.youtube */
export function parseYouTube(input: string): YouTubeRef | null {
  const u = toUrl(input);
  if (!u || !/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = u.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname);
      if (m) id = m[1];
    }
  }
  if (!id || !YT_ID.test(id)) return null;
  const start = parseTime(u.searchParams.get("t") ?? u.searchParams.get("start"));
  return start ? { id, start } : { id };
}

export function youTubeWatchUrl(ref: YouTubeRef): string {
  return `https://www.youtube.com/watch?v=${ref.id}${ref.start ? `&t=${ref.start}s` : ""}`;
}

export function youTubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** http(s) 주소만. 그림인지는 실제로 불러봐야 알기 때문에 여기선 모양만 본다. */
export function normalizeHttpUrl(input: string): string | null {
  const u = toUrl(input);
  if (!u || !/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) {
    // localhost 같은 개발 주소는 그대로 허용
    if (u && /^https?:$/.test(u.protocol) && u.hostname === "localhost") return u.toString();
    return null;
  }
  return u.toString();
}

/** 주소에서 파일 이름 짐작 */
export function nameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    return last || u.hostname;
  } catch {
    return url;
  }
}
