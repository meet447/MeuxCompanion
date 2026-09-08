import { describe, expect, it } from "vitest";
import { isTauriAssetProtocolUrl, withCacheBust } from "./assetUrls";

describe("isTauriAssetProtocolUrl", () => {
  it("matches asset: and asset.localhost (http and https)", () => {
    expect(isTauriAssetProtocolUrl("asset://localhost/%2Fdata%2FHaru.model3.json")).toBe(true);
    expect(isTauriAssetProtocolUrl("http://asset.localhost/home/user/Haru.model3.json")).toBe(true);
    expect(isTauriAssetProtocolUrl("https://asset.localhost/C%3A/Models/utsuwa.vrm")).toBe(true);
    expect(isTauriAssetProtocolUrl("/static/models/live2d/haru/Haru.model3.json")).toBe(false);
    expect(isTauriAssetProtocolUrl("http://localhost:1420/static/foo.json")).toBe(false);
  });
});

describe("withCacheBust", () => {
  const now = 1_700_000_000_000;

  it("leaves Tauri asset-protocol URLs unchanged", () => {
    const asset = "http://asset.localhost/home/ubuntu/.local/share/com.meuxe.app/models/live2d/haru/Haru.model3.json";
    expect(withCacheBust(asset, now)).toBe(asset);
    expect(withCacheBust("https://asset.localhost/foo.vrm", now)).toBe("https://asset.localhost/foo.vrm");
    expect(withCacheBust("asset://localhost/foo", now)).toBe("asset://localhost/foo");
  });

  it("appends t= only to /static/ URLs", () => {
    expect(withCacheBust("/static/models/live2d/haru/Haru.model3.json", now)).toBe(
      "/static/models/live2d/haru/Haru.model3.json?t=1700000000000",
    );
    expect(withCacheBust("/static/foo.json?x=1", now)).toBe("/static/foo.json?x=1&t=1700000000000");
  });

  it("does not cache-bust unrelated http URLs", () => {
    expect(withCacheBust("https://cdn.example/model.vrm", now)).toBe("https://cdn.example/model.vrm");
  });
});
