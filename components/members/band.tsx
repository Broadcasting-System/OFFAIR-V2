import { LockIcon } from "@/components/shell/icons";

/** 부원 공간 화면 맨 위 얇은 보라색 띠 (시안 f8-A) */
export function MembersBand() {
  return (
    <div className="members-band" role="note">
      <LockIcon size={14} />
      <span className="min-w-0 truncate">
        부원 공간<span className="max-[640px]:hidden"> · 로그인한 부원만 보이고 공개 사이트·GitHub 에는 올라가지 않아요</span>
      </span>
    </div>
  );
}
