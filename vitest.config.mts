import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 최소 설정 — 순수 함수 테스트만 (DOM 없음)
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
