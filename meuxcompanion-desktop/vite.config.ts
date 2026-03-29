import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";
import { homedir } from "os";

const host = process.env.TAURI_DEV_HOST;

// Serve files from app data directory under /static/ path in dev mode
function appDataStaticPlugin() {
  const appDataDir = path.join(
    homedir(),
    "Library/Application Support/com.meuxcompanion.app"
  );

  return {
    name: "serve-appdata",
    configureServer(server: any) {
      server.middlewares.use("/static", (req: any, res: any, next: any) => {
        const filePath = path.join(appDataDir, decodeURIComponent(req.url || ""));
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            ".json": "application/json",
            ".moc3": "application/octet-stream",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".mp3": "audio/mpeg",
            ".vrm": "application/octet-stream",
            ".glb": "application/octet-stream",
            ".gltf": "application/json",
            ".fbx": "application/octet-stream",
            ".exp3.json": "application/json",
          };
          res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
          res.setHeader("Access-Control-Allow-Origin", "*");
          fs.createReadStream(filePath).pipe(res);
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), appDataStaticPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
