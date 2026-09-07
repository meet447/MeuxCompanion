import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_LISTINGS,
  displayNameForModelId,
  filterMarketplaceListings,
  mergeMarketplaceWithInstalled,
} from "./marketplaceCatalog";

describe("mergeMarketplaceWithInstalled", () => {
  it("marks bundled and downloaded models as installed", () => {
    const statuses = mergeMarketplaceWithInstalled(MARKETPLACE_LISTINGS, ["haru", "osa-olivia"]);

    expect(statuses.find((s) => s.id === "haru")).toMatchObject({
      installed: true,
      installable: false,
      bundled: true,
    });
    expect(statuses.find((s) => s.id === "osa-olivia")).toMatchObject({
      installed: true,
      installable: false,
    });
    expect(statuses.find((s) => s.id === "hiyori")).toMatchObject({
      installed: false,
      installable: false,
    });
  });

  it("appends local-only installed models", () => {
    const statuses = mergeMarketplaceWithInstalled(MARKETPLACE_LISTINGS, [
      { id: "haru", type: "live2d" },
      { id: "my-import", type: "vrm" },
    ]);
    expect(statuses.find((s) => s.id === "my-import")).toMatchObject({
      installed: true,
      installable: false,
      type: "vrm",
      author: "Local import",
    });
  });

  it("accepts a Set of installed ids", () => {
    const statuses = mergeMarketplaceWithInstalled(MARKETPLACE_LISTINGS, new Set(["utsuwa"]));
    expect(statuses.find((s) => s.id === "utsuwa")?.installed).toBe(true);
  });
});

describe("filterMarketplaceListings", () => {
  const statuses = mergeMarketplaceWithInstalled(MARKETPLACE_LISTINGS, []);

  it("filters by type", () => {
    const live2d = filterMarketplaceListings(statuses, "", "live2d");
    expect(live2d.every((item) => item.type === "live2d")).toBe(true);
    expect(live2d.some((item) => item.id === "haru")).toBe(true);
    expect(live2d.some((item) => item.id === "osa-olivia")).toBe(false);
  });

  it("matches query across name, author, tags, description, license, and collection", () => {
    expect(filterMarketplaceListings(statuses, "polygonal", "all").map((s) => s.id)).toContain(
      "osa-olivia",
    );
    expect(filterMarketplaceListings(statuses, "cc0", "all").length).toBeGreaterThan(0);
    expect(filterMarketplaceListings(statuses, "100avatars", "all").length).toBeGreaterThan(0);
    expect(filterMarketplaceListings(statuses, "live2d inc", "all").map((s) => s.id)).toContain(
      "hiyori",
    );
    expect(filterMarketplaceListings(statuses, "free material", "all").map((s) => s.id)).toContain(
      "mao",
    );
  });

  it("is case-insensitive", () => {
    const lower = filterMarketplaceListings(statuses, "olivia", "all");
    const upper = filterMarketplaceListings(statuses, "OLIVIA", "all");
    expect(lower).toEqual(upper);
  });
});

describe("displayNameForModelId", () => {
  it("returns catalog names when known", () => {
    expect(displayNameForModelId("haru")).toBe("Haru");
    expect(displayNameForModelId("osa-olivia")).toBe("Olivia");
  });

  it("pretty-prints unknown ids", () => {
    expect(displayNameForModelId("osa-mint")).toBe("Mint");
    expect(displayNameForModelId("custom-avatar")).toBe("Custom-avatar");
  });
});
