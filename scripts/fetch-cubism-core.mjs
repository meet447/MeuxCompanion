#!/usr/bin/env node
/**
 * Downloads Live2D Cubism Core for local bundling (CSP 'self').
 * Run from repo root: node scripts/fetch-cubism-core.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "public/vendor/live2d/live2dcubismcore.min.js");
const url = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";
const MIN_SIZE_BYTES = 10 * 1024;

if (fs.existsSync(outPath)) {
  const { size } = fs.statSync(outPath);
  if (size > MIN_SIZE_BYTES) {
    console.log(`Cubism Core already present (${size} bytes): ${outPath}`);
    process.exit(0);
  }
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });

const response = await fetch(url);
if (!response.ok) {
  console.error(`Failed to download Cubism Core: HTTP ${response.status} ${response.statusText}`);
  console.error(`URL: ${url}`);
  process.exit(1);
}

const buffer = Buffer.from(await response.arrayBuffer());
fs.writeFileSync(outPath, buffer);
console.log(`Downloaded Cubism Core (${buffer.length} bytes) to ${outPath}`);
