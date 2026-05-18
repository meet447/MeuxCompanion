#!/usr/bin/env node
/**
 * Records a walkthrough of the full onboarding flow (browser demo with mocked Tauri).
 * Output: artifacts/onboarding-demo.mp4
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const artifactsDir = path.join(root, "artifacts");
const videoDir = path.join(artifactsDir, "onboarding-demo-videos");
const outputMp4 = path.join(artifactsDir, "onboarding-demo.mp4");
const demoUrl = "http://127.0.0.1:5299/";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: options.stdio ?? "inherit",
      env: { ...process.env, ...options.env },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function waitForServer(maxMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(demoUrl);
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(500);
  }
  throw new Error("Onboarding demo server did not start in time");
}

async function main() {
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(artifactsDir, { recursive: true });

  const vite = spawn(
    "npx",
    ["vite", "--config", "scripts/onboarding-demo/vite.config.ts"],
    { cwd: root, stdio: "pipe" },
  );

  try {
    await waitForServer();

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
    });
    const page = await context.newPage();
    await page.goto(demoUrl, { waitUntil: "networkidle" });

    // Wait until Tailwind utilities are applied (gradient background on onboarding shell).
    await page.waitForFunction(
      () => {
        const shell = document.querySelector(".bg-gradient-to-br");
        if (!shell) return false;
        const bg = getComputedStyle(shell).backgroundImage;
        return Boolean(bg && bg !== "none");
      },
      { timeout: 20_000 },
    );
    await sleep(500);

    const continueButton = () => page.getByRole("button", { name: "Continue" });
    const backButton = () => page.getByRole("button", { name: "Back" });

    const pause = (ms) => sleep(ms);

    // Step 0 — Local-first
    await pause(2500);
    await continueButton().click();

    // Step 1 — About you
    await pause(1200);
    await page.getByPlaceholder("What should your companion call you?").fill("Alex");
    await page
      .getByPlaceholder(/Interests, what you do/)
      .fill("Building local-first AI companions with memory, personality, and optional Composio integrations.");
    await pause(2000);
    await continueButton().click();

    // Step 2 — LLM (Ollama = no API key)
    await pause(1200);
    await page.getByRole("button", { name: /Ollama/i }).click();
    await pause(800);
    await page.getByRole("button", { name: /Test Connection/i }).click();
    await page.getByText("Connected successfully!").waitFor({ timeout: 15_000 });
    await pause(2000);
    await continueButton().click();

    // Step 3 — Voice
    await pause(2500);
    await continueButton().click();

    // Step 4 — Integrations
    await page.getByText("Connect optional sources").waitFor({ timeout: 10_000 });
    await pause(2000);
    await page.getByPlaceholder(/Composio API key/i).fill("demo-composio-key");
    await pause(800);
    await page.getByRole("button", { name: "Off", exact: true }).first().click();
    await pause(1000);
    await page.getByRole("button", { name: /Connect|Reconnect/i }).first().click();
    await page.getByText("Connect link ready").waitFor({ timeout: 10_000 });
    await pause(2500);
    await continueButton().click();

    // Step 5 — Build companion
    await pause(1200);
    await page.getByPlaceholder("What should your companion be called?").fill("Haru");
    await pause(3000);
    await page.getByRole("button", { name: "Finish" }).click();

    // Step 6 — Success
    await page.getByText("Your companion is ready").waitFor({ timeout: 20_000 });
    await pause(4000);

    await context.close();
    await browser.close();

    const webmFiles = fs
      .readdirSync(videoDir)
      .filter((name) => name.endsWith(".webm"))
      .map((name) => path.join(videoDir, name));
    if (webmFiles.length === 0) {
      throw new Error("No Playwright video file was produced");
    }
    const newestWebm = webmFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

    await run("ffmpeg", [
      "-y",
      "-i",
      newestWebm,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputMp4,
    ]);

    console.log(`Onboarding demo video: ${outputMp4}`);
  } finally {
    vite.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
