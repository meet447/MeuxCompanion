import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";

// Serve files from app data directory under /static/ path in dev mode
function resolveAppDataDir() {
  const home = homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library/Application Support/com.meuxe.app");
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(home, "AppData", "Roaming"),
      "com.meuxe.app",
    );
  }
  return path.join(home, ".local/share/com.meuxe.app");
}

/** Decode once, before joining, and reject traversal on either path convention. */
function decodeStaticPath(url: string): string | null {
  try {
    const encoded = url.split("?")[0].replace(/^\//, "");
    const decoded = decodeURIComponent(encoded);
    if (!decoded || decoded.includes("\0") || decoded.includes("\\") ||
        path.posix.isAbsolute(decoded) || path.win32.isAbsolute(decoded) ||
        /^[a-z]:/i.test(decoded) || decoded.split("/").includes("..")) return null;
    return decoded;
  } catch {
    return null;
  }
}

/** Canonical containment also rejects symlinks that escape an asset root. */
function resolveUnderRoot(root: string, relative: string): string | null {
  try {
    const canonicalRoot = fs.realpathSync(root);
    const file = fs.realpathSync(path.join(root, relative));
    const fromRoot = path.relative(canonicalRoot, file);
    if (fromRoot === ".." || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) return null;
    return fs.statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

export function createStaticMiddleware(roots: string[]): Connect.NextHandleFunction {
  const serveFile = (filePath: string, req: IncomingMessage, res: ServerResponse) => {
    const stat = fs.statSync(filePath);
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
      ".vrma": "application/octet-stream",
    };
    res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Cache-Control", "no-cache");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    const stream = fs.createReadStream(filePath);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  };

  return (req, res, next) => {
    const relative = decodeStaticPath(req.url || "");
    if (relative === null) {
      res.statusCode = 400;
      res.end("Invalid asset path");
      return;
    }
    for (const root of roots) {
      const file = resolveUnderRoot(root, relative);
      if (file) {
        serveFile(file, req, res);
        return;
      }
    }
    next();
  };
}

export function appDataStaticPlugin(): Plugin {
  const roots = [resolveAppDataDir(), process.cwd(), path.dirname(process.cwd())];
  return {
    name: "serve-appdata",
    configureServer(server) {
      server.middlewares.use("/static", createStaticMiddleware(roots));
    },
  };
}
