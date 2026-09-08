import { describe, expect, it } from "vitest";
import tauriConfig from "../../src-tauri/tauri.conf.json";

function directiveFromCsp(csp: string, name: string): string {
  const match = csp.match(new RegExp(`${name}\\s+([^;]+)`));
  return match?.[1] ?? "";
}

describe("tauri.conf.json CSP", () => {
  const { csp, devCsp } = tauriConfig.app.security;

  it("production script-src includes 'self' and not 'unsafe-eval'", () => {
    const scriptSrc = directiveFromCsp(csp, "script-src");
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("devCsp script-src does not include 'unsafe-eval'", () => {
    const scriptSrc = directiveFromCsp(devCsp, "script-src");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("img-src allows Arweave apex and gateway subdomains", () => {
    for (const policy of [csp, devCsp]) {
      const imgSrc = directiveFromCsp(policy, "img-src");
      expect(imgSrc).toContain("https://arweave.net");
      expect(imgSrc).toContain("https://*.arweave.net");
    }
  });
});
