/**
 * 편집기 아이콘 — 시안(editor-toolbar.html)과 같은 선 아이콘. 20px, 선 1.4.
 * 같은 아이콘을 두 가지 뜻으로 쓰지 않는다.
 */
const P: Record<string, React.ReactNode> = {
  undo: (<><path d="M9 7 5 11l4 4" /><path d="M5 11h9a5 5 0 0 1 0 10h-2" /></>),
  redo: (<><path d="m15 7 4 4-4 4" /><path d="M19 11h-9a5 5 0 0 0 0 10h2" /></>),
  bullet: (<><circle cx="5" cy="7" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="5" cy="17" r="1" /><path d="M9 7h11M9 12h11M9 17h11" /></>),
  number: (<><path d="M4 6h1.5v4M4 10h3M4 14.5c0-.8.7-1.5 1.5-1.5s1.5.6 1.5 1.3c0 1.2-3 2-3 3.7h3" /><path d="M10 7h10M10 12h10M10 17h10" /></>),
  todo: (<><rect x="3.5" y="5" width="5" height="5" rx="1" /><path d="m4.7 7.6 1 1 1.8-2" /><rect x="3.5" y="14" width="5" height="5" rx="1" /><path d="M11 7.5h9M11 16.5h9" /></>),
  warn: (<><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4M12 16.8v.1" /></>),
  info: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.1" /></>),
  tip: (<><path d="M9 17h6M10 20h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>),
  note: (<><path d="M5.5 4.5h13v15h-13z" /><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" /></>),
  danger: (<><path d="M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z" /><path d="M12 8v5M12 16v.1" /></>),
  table: (<><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10M15 9.5v10" /></>),
  image: (<><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 18 5.5-5 4 3.5 2.5-2 4 3.5" /></>),
  steps: (<><circle cx="6" cy="6.5" r="2.5" /><circle cx="6" cy="17.5" r="2.5" /><path d="M6 9v6M11 6.5h9M11 17.5h9" /></>),
  plus: (<><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" /></>),
  add: (<path d="M12 5v14M5 12h14" />),
  comment: (<><path d="M4.5 5.5h15v10h-9l-4.5 4v-4h-1.5z" /><path d="M8.5 9.5h7M8.5 12.5h4" /></>),
  chev: (<path d="m6 9 6 6 6-6" />),
  code: (<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />),
  quote: (<path d="M6 17c-1.5-1-2-2.7-2-4.5C4 9.4 6 7 9 6M14 17c-1.5-1-2-2.7-2-4.5C12 9.4 14 7 17 6" />),
  hr: (<><path d="M3 12h18" /><path d="M8 7h8M8 17h8" opacity=".4" /></>),
  file: (<><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" /><path d="M14 3.5V8h4.5" /></>),
  video: (<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10.5 5-3v9l-5-3" /></>),
  link: (<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />),
  page: (<><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 15.5h6" /></>),
  upload: (<><path d="M12 15V4M8 8l4-4 4 4" /><path d="M4.5 15v4.5h15V15" /></>),
  card: (<><rect x="3.5" y="5" width="7.5" height="14" rx="1.5" /><rect x="13" y="5" width="7.5" height="14" rx="1.5" /><path d="M6 9h3M15.5 9h3" /></>),
  text: (<path d="M5 6h14M12 6v13M9 19h6" />),
  h1: (<path d="M4 6v12M12 6v12M4 12h8M16 9l3-2v11" />),
  h2: (<path d="M4 6v12M12 6v12M4 12h8M15.5 9.5a2.5 2.5 0 0 1 5 .3c0 1.6-1.6 2.6-5 6.2h5" />),
  h3: (<path d="M4 6v12M12 6v12M4 12h8M15.5 8h4.5l-2.5 3.5a2.6 2.6 0 1 1-2 4.4" />),
  raw: (<><path d="M8.5 4.5c-2 0-2.5 1-2.5 2.5v2.5c0 1.2-.8 2.5-2 2.5 1.2 0 2 1.3 2 2.5V17c0 1.5.5 2.5 2.5 2.5" /><path d="M15.5 4.5c2 0 2.5 1 2.5 2.5v2.5c0 1.2.8 2.5 2 2.5-1.2 0-2 1.3-2 2.5V17c0 1.5-.5 2.5-2.5 2.5" /></>),
  trash: (<><path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7" /></>),
  close: (<path d="M6 6l12 12M18 6 6 18" />),
  check: (<path d="m5 12.5 4.5 4.5L19 7.5" />),
  external: (<><path d="M14 4.5h5.5V10M19.5 4.5 11 13" /><path d="M17 14v5.5H4.5V7H10" /></>),
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={className ? `we-ic ${className}` : "we-ic"}
    >
      {P[name] ?? P.page}
    </svg>
  );
}
