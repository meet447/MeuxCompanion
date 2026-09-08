import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MARKETPLACE_LISTINGS } from "../../lib/marketplaceCatalog";
import { ModelMarketplace } from "./ModelMarketplace";

vi.mock("../../api/tauri", () => ({
  installMarketplaceModel: vi.fn(),
}));

vi.mock("../../lib/openExternal", () => ({
  openExternalUrl: vi.fn(),
}));

describe("ModelMarketplace", () => {
  it("replaces a failed thumbnail with the type placeholder", () => {
    const osa = MARKETPLACE_LISTINGS.find((listing) => listing.thumbnailUrl);
    expect(osa?.thumbnailUrl).toBeTruthy();

    const { container } = render(
      <ModelMarketplace
        installedModels={[]}
        selectedId=""
        onSelect={vi.fn()}
        onInstalled={vi.fn()}
      />,
    );

    const thumb = container.querySelector(`img[src="${osa!.thumbnailUrl}"]`);
    expect(thumb).not.toBeNull();
    fireEvent.error(thumb!);
    expect(container.querySelector(`img[src="${osa!.thumbnailUrl}"]`)).toBeNull();
    expect(screen.getAllByText("VRM").length).toBeGreaterThan(0);
  });
});
