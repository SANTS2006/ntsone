import { defineConfig } from "vitest/config";

// Fast tests that never touch a database or the network: safe to run anywhere, including CI.
export default defineConfig({
  test: { environment: "node", include: ["tests/unit/**/*.spec.ts"] },
});
