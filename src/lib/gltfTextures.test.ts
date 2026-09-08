import { describe, expect, it } from "vitest";
import { shouldAvoidImageBitmapLoader } from "./gltfTextures";

describe("shouldAvoidImageBitmapLoader", () => {
  it("is true for WebKitGTK / WKWebView Safari-like UAs", () => {
    expect(
      shouldAvoidImageBitmapLoader(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      ),
    ).toBe(true);
    expect(
      shouldAvoidImageBitmapLoader(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      ),
    ).toBe(true);
  });

  it("is false for Chromium, which handles ImageBitmapLoader", () => {
    expect(
      shouldAvoidImageBitmapLoader(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });
});
