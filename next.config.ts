import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Screenshots are pre-optimized to ~1280px WebP at build time, so we skip
  // Next's on-demand image optimizer (which added 1–2s cold-start latency on
  // first request in production). Images now serve directly from the CDN.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
