import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const demoDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(demoDir, "../..");

export default defineConfig({
  root: demoDir,
  plugins: [
    react(),
    tailwindcss({
      // Ensure Tailwind resolves sources from the repo root, not only demoDir.
      base: repoRoot,
    }),
  ],
  resolve: {
    alias: {
      "@tauri-apps/api/core": path.join(demoDir, "mock-tauri.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5299,
    strictPort: true,
  },
});
