import { defineConfig } from "vitest/config";
import path from "node:path";

// vitest 는 편집기·미디어 테스트만 (DOM 이 필요한 파일은 맨 위에 `@vitest-environment happy-dom`).
// tests/*.test.ts (저장소·API) 는 node:test 로 따로 돈다.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/editor/**/*.test.ts", "lib/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
