import { describe, expect, it } from "vitest";
import tauriConfig from "../../src-tauri/tauri.conf.json";

function scriptSrcFromCsp(csp: string): string {
  const match = csp.match(/script-src\s+([^;]+)/);
  return match?.[1] ?? "";
}

describe("tauri.conf.json CSP", () => {
  const { csp, devCsp } = tauriConfig.app.security;

  it("production script-src includes 'self' and not 'unsafe-eval'", () => {
    const scriptSrc = scriptSrcFromCsp(csp);
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("devCsp script-src does not include 'unsafe-eval'", () => {
    const scriptSrc = scriptSrcFromCsp(devCsp);
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });
});
