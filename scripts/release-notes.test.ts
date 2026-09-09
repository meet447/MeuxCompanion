import { describe, expect, it } from "vitest";
import {
  cargoTomlPackageVersion,
  extractChangelogSection,
  formatGithubOutput,
  jsonVersion,
  loadReleaseNotes,
  readAppVersions,
} from "./release-notes.mjs";

const sampleChangelog = `# Changelog

## [0.2.0] - 2026-10-01

Second release.

### Added
- Something new.

[0.2.0]: https://example.com/v0.2.0

## [0.1.1] - 2026-09-08

First release.

### Added
- Hello.
`;

describe("release-notes", () => {
  it("reads JSON and Cargo.toml package versions", () => {
    expect(jsonVersion('{"version":"0.1.1"}')).toBe("0.1.1");
    expect(
      cargoTomlPackageVersion(`[package]
name = "meuxe-desktop"
version = "0.1.1"
edition = "2021"

[dependencies]
tauri-build = { version = "2.6" }
`),
    ).toBe("0.1.1");
  });

  it("extracts a version section and stops before the next heading or link ref", () => {
    expect(extractChangelogSection(sampleChangelog, "0.2.0")).toBe(`Second release.

### Added
- Something new.`);
    expect(extractChangelogSection(sampleChangelog, "0.1.1")).toBe(`First release.

### Added
- Hello.`);
  });

  it("fails when the changelog section is missing or empty", () => {
    expect(() => extractChangelogSection(sampleChangelog, "9.9.9")).toThrow(/no "## \[9\.9\.9\]"/);
    expect(() => extractChangelogSection("## [0.1.1]\n\n", "0.1.1")).toThrow(/empty/);
  });

  it("formats GitHub Actions output with a multiline body", () => {
    const output = formatGithubOutput(
      {
        version: "0.1.1",
        name: "Meuxe v0.1.1",
        tag: "v0.1.1",
        body: "First release.\n\n### Added\n- Hello.",
      },
      "EOFTEST",
    );
    expect(output).toBe(
      ["version=0.1.1", "name=Meuxe v0.1.1", "tag=v0.1.1", "body<<EOFTEST", "First release.\n\n### Added\n- Hello.", "EOFTEST"].join(
        "\n",
      ),
    );
  });

  it("loads the repo changelog for the current app version", () => {
    const version = readAppVersions();
    const notes = loadReleaseNotes();
    expect(notes.version).toBe(version);
    expect(notes.tag).toBe(`v${version}`);
    expect(notes.name).toBe(`Meuxe v${version}`);
    expect(notes.body).toContain("### Fixed");
    expect(notes.body).toContain("Known limits");
    expect(notes.body).not.toContain("## [");
  });
});
