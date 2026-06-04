import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteBackground } from "@/components/site-background";
import { getNav, getSearchIndex } from "@/lib/content";
import { IS_DEV } from "@/lib/dev";

const orbitron = localFont({
  src: "./fonts/Orbitron.ttf",
  variable: "--font-orbitron",
  weight: "400 900",
  display: "swap",
});

const pretendard = localFont({
  src: "./fonts/PretendardVariable.ttf",
  variable: "--font-pretendard",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "OFFAIR — BSSM Broadcast Guide Book",
    template: "%s · OFFAIR",
  },
  description:
    "부산소프트웨어마이스터고 방송부 OFFAIR 의 장비·송출·운영 가이드북.",
  metadataBase: new URL("https://offair.local"),
  openGraph: {
    title: "OFFAIR — BSSM Broadcast Guide Book",
    description: "부산소프트웨어마이스터고 방송부 운영 가이드북",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nav = getNav();
  const searchIndex = getSearchIndex();
  return (
    <html
      lang="ko"
      className={`${orbitron.variable} ${pretendard.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-ink-950">
        <SiteBackground />
        <SiteHeader nav={nav} searchIndex={searchIndex} devEdit={IS_DEV} />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
