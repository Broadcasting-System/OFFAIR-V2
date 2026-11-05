import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Screenshots are pre-optimized to ~1280px WebP at build time, so we skip
  // Next's on-demand image optimizer (which added 1–2s cold-start latency on
  // first request in production). Images now serve directly from the CDN.
  images: {
    unoptimized: true,
  },
  // 문서 저장소(lib/store)는 경로를 환경 변수로 정하므로 추적기가 content/ 를 못 본다.
  // Vercel 사본이 ISR 로 다시 그릴 때 문서를 읽을 수 있게 명시적으로 넣는다.
  outputFileTracingIncludes: {
    "/**": ["./content/**/*"],
  },
};

export default nextConfig;
