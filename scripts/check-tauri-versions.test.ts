import { describe, expect, it } from "vitest";
import {
  cargoCrateVersion,
  checkRepoTauriVersions,
  checkTauriVersions,
  majorMinor,
  npmPackageVersion,
} from "./check-tauri-versions.mjs";

describe("check-tauri-versions", () => {
  it("parses crate and npm lockfile versions", () => {
    const cargoLock = `[[package]]
name = "tauri"
version = "2.11.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
`;
    const packageLock = `{
    "node_modules/@tauri-apps/api": {
      "version": "2.11.1",
      "resolved": "https://registry.npmjs.org/@tauri-apps/api/-/api-2.11.1.tgz"
    }
}`;
    expect(cargoCrateVersion(cargoLock, "tauri")).toBe("2.11.5");
    expect(npmPackageVersion(packageLock, "@tauri-apps/api")).toBe("2.11.1");
    expect(majorMinor("2.11.5")).toBe("2.11");
    expect(() => checkTauriVersions(cargoLock, packageLock)).not.toThrow();
  });

  it("rejects a major.minor drift between Rust tauri and @tauri-apps/api", () => {
    const cargoLock = `[[package]]
name = "tauri"
version = "2.10.3"
`;
    const packageLock = `{
    "node_modules/@tauri-apps/api": {
      "version": "2.11.1"
    }
}`;
    expect(() => checkTauriVersions(cargoLock, packageLock)).toThrow(/2\.10\.3.*2\.11\.1/);
  });

  it("keeps the repo lockfiles aligned", () => {
    const { rustTauri, jsApi } = checkRepoTauriVersions();
    expect(majorMinor(rustTauri)).toBe(majorMinor(jsApi));
  });
});
