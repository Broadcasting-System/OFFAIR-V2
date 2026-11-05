import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { PREFS_SCRIPT } from "@/components/shell/prefs-script";
import { getNav, getSearchIndex } from "@/lib/content";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.ttf",
  variable: "--font-pretendard",
  weight: "100 900",
  display: "swap",
});

// 위키 저장은 revalidatePath 로 바로 반영된다. 이 값은 git pull 등 바깥에서 바뀐 문서를
// 늦어도 5분 안에 다시 그리기 위한 안전망이다.
export const revalidate = 300;

export const metadata: Metadata = {
  title: {
    default: "OFFAIR — 방송부 가이드북",
    template: "%s · OFFAIR",
  },
  description:
    "부산소프트웨어마이스터고 방송부 OFFAIR 의 장비·송출·운영 가이드북.",
  metadataBase: new URL("https://offair.local"),
  openGraph: {
    title: "OFFAIR — 방송부 가이드북",
    description: "부산소프트웨어마이스터고 방송부 운영 가이드북",
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
  const nav = getNav();
  const searchIndex = getSearchIndex();
  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <head>
        {/* 테마·서랍·목차 상태를 칠하기 전에 <html> 에 붙인다 (깜빡임 방지) */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body>
        <AppShell nav={nav} searchIndex={searchIndex}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
