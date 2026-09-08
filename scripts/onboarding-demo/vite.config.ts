import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const demoDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(demoDir, "../..");

function staticModelsPlugin() {
  return {
    name: "serve-models",
    configureServer(server) {
      server.middlewares.use("/static", (req, res, next) => {
        const urlPath = decodeURIComponent((req.url || "").split("?")[0]);
        const filePath = path.join(repoRoot, urlPath);
        if (!filePath.startsWith(repoRoot) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          next();
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = {
          ".json": "application/json",
          ".png": "image/png",
          ".moc3": "application/octet-stream",
          ".vrm": "application/octet-stream",
          ".vrma": "application/octet-stream",
        }[ext] || "application/octet-stream";
        res.setHeader("Content-Type", mime);
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: demoDir,
  publicDir: path.join(repoRoot, "public"),
  plugins: [
    react(),
    tailwindcss({
      base: repoRoot,
    }),
    staticModelsPlugin(),
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
