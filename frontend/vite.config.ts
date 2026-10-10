import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// The public address (APP_URL on Render) for canonical links and link previews in index.html.
const SITE_URL = (process.env.APP_URL || "https://ntsone.ntsdigitalsolutions.com").replace(/\/+$/, "");

function siteUrl(): Plugin {
  return { name: "site-url", transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", SITE_URL) };
}

export default defineConfig({
  plugins: [react(), siteUrl()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
      // Card and ticket designs are shared with the backend so previews match the PDFs.
      "@designs": path.resolve(dirname, "../backend/src/shared/designs/index.ts"),
    },
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        // React changes less often than the app, so it gets its own long-cached file. Other
        // libraries are left to the bundler so each page only loads the ones it uses.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
