/** 얇은 선 아이콘 모음 (시안과 같은 1.5px 선). */

type IconProps = { size?: number; className?: string };

function Svg({
  size = 18,
  className = "",
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-none ${className}`}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const TreeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5h14M5 12h14M5 19h9" />
  </Svg>
);
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.5-4.5" />
  </Svg>
);
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </Svg>
);
export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" />
  </Svg>
);
export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);
export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);
export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </Svg>
);
export const PencilIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3Z" />
    <path d="m13.5 6.5 3 3" />
  </Svg>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);
export const DocIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5" />
  </Svg>
);
