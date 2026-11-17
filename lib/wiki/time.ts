/** 위키 화면의 날짜·시각 표시 (언제나 서울 시간) */

const tz = "Asia/Seoul";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
const md = new Intl.DateTimeFormat("ko-KR", { timeZone: tz, month: "long", day: "numeric" });
const ymd = new Intl.DateTimeFormat("ko-KR", { timeZone: tz, year: "numeric", month: "long", day: "numeric" });
export const hm = new Intl.DateTimeFormat("ko-KR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "오늘" · "어제" · "11월 3일" (올해가 아니면 연도까지) */
export function dayLabel(d: Date, now = new Date()): string {
  const k = dayKey.format(d);
  if (k === dayKey.format(now)) return "오늘";
  if (k === dayKey.format(new Date(now.getTime() - 86400000))) return "어제";
  return k.slice(0, 4) === dayKey.format(now).slice(0, 4) ? md.format(d) : ymd.format(d);
}

/** "오늘 17:10" · "11월 3일 17:10" */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  return `${dayLabel(d)} ${hm.format(d)}`;
}
