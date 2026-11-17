/**
 * 유튜브 영상 (MDX: `<YouTube id="dQw4w9WgXcQ" start={30} title="사용법" />`).
 *
 * - youtube-nocookie.com 을 써서 재생 전에는 추적 쿠키를 심지 않는다
 * - loading="lazy" — 화면에 가까워질 때 불러온다
 * - 16:9 상자, iframe title 은 영상 제목(없으면 "유튜브 영상") — 화면 읽기 프로그램용
 * - 주소가 이상하면 아무것도 그리지 않고 짧은 안내만
 */
const ID = /^[A-Za-z0-9_-]{11}$/;

export function YouTube({ id, start, title }: { id: string; start?: number | string; title?: string }) {
  const name = (title ?? "").trim() || "유튜브 영상";
  if (!id || !ID.test(String(id))) {
    return <p className="text-[14px] text-fg-3">유튜브 영상 주소가 올바르지 않아요.</p>;
  }
  const s = Number(start);
  const qs = new URLSearchParams({ rel: "0" });
  if (Number.isFinite(s) && s > 0) qs.set("start", String(Math.floor(s)));
  return (
    <figure className="my-6">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?${qs}`}
          title={name}
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      </div>
      {title && <figcaption className="mt-2 text-center text-[13.5px] text-fg-3">{title}</figcaption>}
    </figure>
  );
}
