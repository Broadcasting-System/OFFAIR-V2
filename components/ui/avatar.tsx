/** 이름 앞 두 글자 동그라미. 색은 이름으로 정해져 같은 사람은 언제나 같은 색 */

const AVATAR = ["#ffab00", "#4bce97", "#9f8fef", "#6cc3e0", "#f87168", "#94c748"];

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className="grid flex-none place-items-center rounded-full font-bold text-[#172b4d]"
      style={{ width: size, height: size, fontSize: size <= 22 ? 8.5 : size >= 26 ? 10 : 9, background: AVATAR[h % AVATAR.length] }}
    >
      {name.slice(0, 2)}
    </span>
  );
}
