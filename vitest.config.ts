import { defineConfig } from "vitest/config";
import path from "node:path";

// 편집기 변환기·단축키 테스트용 최소 설정 (DOM 이 필요한 파일은 맨 위에 `@vitest-environment happy-dom`)
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
