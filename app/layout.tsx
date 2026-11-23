import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { PREFS_SCRIPT } from "@/components/shell/prefs-script";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.ttf",
  variable: "--font-pretendard",
  weight: "100 900",
  display: "swap",
});

// 두 공간 모두 부원 전용이라 화면은 언제나 요청마다 그린다 (권한 확인, 정적 HTML·ISR 없음).
// 루트 레이아웃에는 문서 목록·검색 색인을 넣지 않는다. 서랍 트리·검색은 브라우저가 권한 확인 API 로 받는다.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "OFFAIR",
    template: "%s · OFFAIR",
  },
  description: "부산소프트웨어마이스터고 방송부 OFFAIR 위키",
  metadataBase: new URL("https://offair.local"),
  robots: { index: false, follow: false },
  openGraph: {
    title: "OFFAIR",
    description: "부산소프트웨어마이스터고 방송부 OFFAIR 위키",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1d2125" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <head>
        {/* 테마·서랍·목차 상태를 칠하기 전에 <html> 에 붙인다 (깜빡임 방지) */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
