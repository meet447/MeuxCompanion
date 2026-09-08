#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "artifacts", "screenshots");
const demoUrl = "http://127.0.0.1:5299/";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(maxMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(demoUrl);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error("Demo server did not start");
}

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const vite = spawn(
    "npx",
    ["vite", "--config", "scripts/onboarding-demo/vite.config.ts"],
    { cwd: root, stdio: "pipe" },
  );
  vite.stderr.on("data", (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(demoUrl, { waitUntil: "networkidle" });
    await page.waitForSelector("text=A companion on your desktop", { timeout: 20_000 });
    await sleep(400);
    await shot(page, "01-onboarding-start");

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByPlaceholder("e.g. Alex").fill("Alex");
    await page.getByPlaceholder("A line or two about you…").fill("I like building local companions.");
    await sleep(200);
    await shot(page, "02-onboarding-you");

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Haru").first().waitFor();
    await sleep(2500);
    await shot(page, "03-onboarding-look");

    await page.getByRole("button", { name: /Haru/i }).click();
    await sleep(600);
    await shot(page, "04-onboarding-look-haru");

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByPlaceholder("Who are you creating?").fill("Mira");
    await page.getByRole("button", { name: /Warm & thoughtful/i }).click();
    await sleep(200);
    await shot(page, "05-onboarding-personality");

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Meuxe TTS" }).waitFor();
    await sleep(400);
    await shot(page, "06-onboarding-voice-meuxe-tts");

    await page.getByRole("button", { name: "System voice" }).click();
    await sleep(300);
    await shot(page, "07-onboarding-voice-system");

    await page.getByRole("button", { name: "Meuxe TTS" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Who answers for them?").waitFor();
    await sleep(400);
    await shot(page, "08-onboarding-connect");

    await page.getByRole("button", { name: "Finish" }).click();
    await page.getByText(/waiting on your desktop/i).waitFor({ timeout: 10_000 });
    await sleep(400);
    await shot(page, "09-onboarding-done");

    await browser.close();
  } finally {
    vite.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
