import { describe, expect, it } from "vitest";
import { dirnamePath, joinDir, rewriteLive2DFileReferences } from "./live2dSettings";
import { isViteDevHost } from "./assetUrls";

describe("rewriteLive2DFileReferences", () => {
  it("rewrites moc, textures, and nested motion/expression files", () => {
    const rewritten = rewriteLive2DFileReferences(
      {
        FileReferences: {
          Moc: "Haru.moc3",
          Textures: ["Haru.2048/texture_00.png"],
          Physics: "Haru.physics3.json",
          Expressions: [{ File: "expressions/F01.exp3.json" }],
          Motions: { Idle: [{ File: "motions/idle.motion3.json" }] },
        },
      },
      (rel) => `asset://localhost/${rel}`,
    );

    expect(rewritten.FileReferences?.Moc).toBe("asset://localhost/Haru.moc3");
    expect(rewritten.FileReferences?.Textures).toEqual(["asset://localhost/Haru.2048/texture_00.png"]);
    expect(rewritten.FileReferences?.Physics).toBe("asset://localhost/Haru.physics3.json");
    expect(rewritten.FileReferences?.Expressions?.[0].File).toBe(
      "asset://localhost/expressions/F01.exp3.json",
    );
    expect(rewritten.FileReferences?.Motions?.Idle?.[0].File).toBe(
      "asset://localhost/motions/idle.motion3.json",
    );
  });
});

describe("path helpers", () => {
  it("splits a Unix model path", () => {
    expect(dirnamePath("/data/models/live2d/haru/Haru.model3.json")).toBe(
      "/data/models/live2d/haru",
    );
    expect(joinDir("/data/models/live2d/haru", "Haru.2048/texture_00.png")).toBe(
      "/data/models/live2d/haru/Haru.2048/texture_00.png",
    );
  });
});

describe("isViteDevHost", () => {
  it("matches the Vite tauri-dev origin", () => {
    expect(isViteDevHost({ hostname: "localhost", port: "1420" })).toBe(true);
    expect(isViteDevHost({ hostname: "tauri.localhost", port: "" })).toBe(false);
  });
});
