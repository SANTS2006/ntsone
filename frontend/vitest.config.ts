import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Fast checks of the browser-side safety nets (error screens, stale-version recovery, token refresh). No network, no server.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(dirname, "./src") } },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"], restoreMocks: true },
});
