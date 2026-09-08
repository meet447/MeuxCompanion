#!/usr/bin/env node
/**
 * Release notes come from CHANGELOG.md. The version comes from package.json
 * and must match tauri.conf.json and the Cargo.toml package versions.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function jsonVersion(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (typeof parsed.version !== "string" || parsed.version.length === 0) {
    throw new Error("missing version field");
  }
  return parsed.version;
}

export function cargoTomlPackageVersion(toml) {
  const afterPackage = toml.split("[package]")[1];
  if (!afterPackage) {
    throw new Error("Cargo.toml is missing a [package] table");
  }
  const match = afterPackage.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error("Cargo.toml [package] is missing version");
  }
  return match[1];
}

export function extractChangelogSection(markdown, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^## \\[${escaped}\\](?:\\s+-\\s+.+)?\\s*$`, "m");
  const headingMatch = heading.exec(markdown);
  if (!headingMatch) {
    throw new Error(
      `CHANGELOG.md has no "## [${version}]" section. Add release notes for this version before tagging.`,
    );
  }
  const afterHeading = markdown.slice(headingMatch.index + headingMatch[0].length);
  // Stop at the next H2 (`## ` but not `###`) or a Keep a Changelog link ref.
  const endMatch = afterHeading.match(/\n(?=## [^#]|\[[^\]]+\]:\s)/);
  const body = (endMatch ? afterHeading.slice(0, endMatch.index) : afterHeading)
    .replace(/^\s+/, "")
    .replace(/\s+$/, "");
  if (!body) {
    throw new Error(`CHANGELOG.md section for ${version} is empty`);
  }
  return body;
}

export function readAppVersions(repoRoot = root) {
  const pkg = jsonVersion(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const tauri = jsonVersion(readFileSync(join(repoRoot, "src-tauri/tauri.conf.json"), "utf8"));
  const desktop = cargoTomlPackageVersion(readFileSync(join(repoRoot, "src-tauri/Cargo.toml"), "utf8"));
  const core = cargoTomlPackageVersion(readFileSync(join(repoRoot, "crates/meuxe-core/Cargo.toml"), "utf8"));
  const versions = { pkg, tauri, desktop, core };
  const mismatched = Object.entries(versions).filter(([, value]) => value !== pkg);
  if (mismatched.length > 0) {
    const detail = Object.entries(versions)
      .map(([name, value]) => `${name}=${value}`)
      .join(", ");
    throw new Error(`App versions do not match: ${detail}`);
  }
  return pkg;
}

export function loadReleaseNotes(repoRoot = root) {
  const version = readAppVersions(repoRoot);
  const changelog = readFileSync(join(repoRoot, "CHANGELOG.md"), "utf8");
  const body = extractChangelogSection(changelog, version);
  return {
    version,
    name: `Meuxe v${version}`,
    tag: `v${version}`,
    body,
  };
}

export function formatGithubOutput({ version, name, tag, body }, delimiter = `EOF_${randomUUID().replaceAll("-", "")}`) {
  if (body.includes(delimiter)) {
    throw new Error("changelog body collided with GitHub output delimiter");
  }
  return [`version=${version}`, `name=${name}`, `tag=${tag}`, `body<<${delimiter}`, body, delimiter].join("\n");
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const notes = loadReleaseNotes();
  if (process.argv.includes("--github-output")) {
    process.stdout.write(`${formatGithubOutput(notes)}\n`);
  } else if (process.argv.includes("--check")) {
    console.log(`Release notes ready: ${notes.name}`);
  } else {
    process.stdout.write(`${notes.body}\n`);
  }
}
