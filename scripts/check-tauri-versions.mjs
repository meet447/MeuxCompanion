#!/usr/bin/env node
/**
 * The Tauri CLI refuses to build when the Rust `tauri` crate and
 * `@tauri-apps/api` differ on major.minor (e.g. 2.10 vs 2.11).
 * That mismatch is what broke the v0.1.1 GitHub Release workflow.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function cargoCrateVersion(lock, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = lock.match(
    new RegExp(`\\[\\[package\\]\\]\\s*name = "${escaped}"\\s*version = "([^"]+)"`),
  );
  if (!match) {
    throw new Error(`crate ${name} not found in Cargo.lock`);
  }
  return match[1];
}

export function npmPackageVersion(lock, name) {
  const key = `"node_modules/${name}"`;
  const idx = lock.indexOf(key);
  if (idx === -1) {
    throw new Error(`package ${name} not found in package-lock.json`);
  }
  const slice = lock.slice(idx, idx + 400);
  const match = slice.match(/"version": "([^"]+)"/);
  if (!match) {
    throw new Error(`version for ${name} not found in package-lock.json`);
  }
  return match[1];
}

export function majorMinor(version) {
  const parts = version.split(".");
  if (parts.length < 2) {
    throw new Error(`unexpected version ${version}`);
  }
  return `${parts[0]}.${parts[1]}`;
}

export function checkTauriVersions(cargoLock, packageLock) {
  const rustTauri = cargoCrateVersion(cargoLock, "tauri");
  const jsApi = npmPackageVersion(packageLock, "@tauri-apps/api");
  const rustMinor = majorMinor(rustTauri);
  const jsMinor = majorMinor(jsApi);
  if (rustMinor !== jsMinor) {
    throw new Error(
      `Tauri version mismatch: rust crate tauri (${rustTauri}) vs @tauri-apps/api (${jsApi}). ` +
        `Keep them on the same major.minor before running a release build.`,
    );
  }
  return { rustTauri, jsApi };
}

export function checkRepoTauriVersions(repoRoot = root) {
  const cargoLock = readFileSync(join(repoRoot, "Cargo.lock"), "utf8");
  const packageLock = readFileSync(join(repoRoot, "package-lock.json"), "utf8");
  return checkTauriVersions(cargoLock, packageLock);
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const { rustTauri, jsApi } = checkRepoTauriVersions();
  console.log(`Tauri versions aligned: tauri ${rustTauri}, @tauri-apps/api ${jsApi}`);
}
