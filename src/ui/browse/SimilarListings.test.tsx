import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key
}));

vi.mock("./ListingCard", () => ({
  default: ({ listing }: any) => <div data-testid="similar-card">{listing.title}</div>
}));

import SimilarListings from "./SimilarListings";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SimilarListings", () => {
  it("keeps at most three listings from the same category and market", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { listing_id: "current", market_code: "FR", title: "Current" },
          { listing_id: "fr-1", market_code: "FR", title: "FR 1" },
          { listing_id: "gb-1", market_code: "GB", title: "GB 1" },
          { listing_id: "fr-2", market_code: "FR", title: "FR 2" },
          { listing_id: "fr-3", market_code: "FR", title: "FR 3" },
          { listing_id: "fr-4", market_code: "FR", title: "FR 4" }
        ]
      })
    } as Response);

    render(<SimilarListings listingId="current" category="mobility" marketCode="FR" />);

    await waitFor(() => expect(screen.getAllByTestId("similar-card")).toHaveLength(3));
    expect(screen.getByText("FR 1")).toBeTruthy();
    expect(screen.queryByText("GB 1")).toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toContain("category=mobility");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("limit=30");
  });
});
