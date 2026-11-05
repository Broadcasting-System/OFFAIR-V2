/* 미디어 컴포넌트용 작은 선 아이콘 (24 격자, currentColor) */

import type { ReactNode } from "react";

function Ic({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <svg className="wm-ic" viewBox="0 0 24 24" aria-hidden={label ? undefined : true} aria-label={label}>
      {children}
    </svg>
  );
}

export const IconSearch = () => (
  <Ic>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.5-4.5" />
  </Ic>
);
export const IconSelect = () => (
  <Ic>
    <path d="M6 4l12 7.5-5.2 1.3L10 18z" />
  </Ic>
);
export const IconNumber = () => (
  <Ic>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M10.5 9.5 12.5 8v8" />
  </Ic>
);
export const IconBox = () => (
  <Ic>
    <rect x="4.5" y="5.5" width="15" height="13" rx="3" />
  </Ic>
);
export const IconArrow = () => (
  <Ic>
    <path d="M5 12h13M13 7l5 5-5 5" />
  </Ic>
);
export const IconText = () => (
  <Ic>
    <path d="M6 6h12M12 6v13" />
  </Ic>
);
export const IconRedact = () => (
  <Ic>
    <rect x="4.5" y="4.5" width="15" height="15" rx="2" />
    <path d="M4.5 9.5h15M4.5 14.5h15M9.5 4.5v15M14.5 4.5v15" />
  </Ic>
);
export const IconCrop = () => (
  <Ic>
    <path d="M7 3v14h14M3 7h14v14" />
  </Ic>
);
export const IconUndo = () => (
  <Ic>
    <path d="M9 7 4.5 11.5 9 16" />
    <path d="M5 11.5h9.5a5 5 0 0 1 0 10H12" />
  </Ic>
);
export const IconRedo = () => (
  <Ic>
    <path d="m15 7 4.5 4.5L15 16" />
    <path d="M19 11.5H9.5a5 5 0 0 0 0 10H12" />
  </Ic>
);
export const IconTrash = () => (
  <Ic>
    <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
  </Ic>
);
export const IconUpload = () => (
  <svg className="wm-ic" viewBox="0 0 24 24" aria-hidden style={{ width: 28, height: 28 }}>
    <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5" />
    <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
  </svg>
);
export const IconX = () => (
  <Ic>
    <path d="M6 6l12 12M18 6 6 18" />
  </Ic>
);
export const IconPen = () => (
  <Ic>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Ic>
);
