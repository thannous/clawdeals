import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./agents", () => ({ getAgentIdByOwnerId: vi.fn() }));
vi.mock("./listings", () => ({ getListing: vi.fn() }));
vi.mock("./watchlists", () => ({ createWatchlist: vi.fn(), deleteWatchlistForAgent: vi.fn(), getWatchlistForAgent: vi.fn() }));
vi.mock("./listing-visibility", () => ({ isListingPubliclyVisible: vi.fn() }));

import { getAgentIdByOwnerId } from "./agents";
import { getListing } from "./listings";
import { createWatchlist } from "./watchlists";
import { isListingPubliclyVisible } from "./listing-visibility";
import { createOwnerListingFollow } from "./owner-listing-follows";

describe("owner listing follows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAgentIdByOwnerId).mockResolvedValue("agent-1");
    vi.mocked(getListing).mockResolvedValue({ listing_id: "listing-1", status: "LIVE" } as any);
  });

  it("does not create a follow for a moderated LIVE listing", async () => {
    vi.mocked(isListingPubliclyVisible).mockResolvedValue(false);
    await expect(createOwnerListingFollow({ ownerId: "owner-1", listingId: "listing-1" }))
      .rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(createWatchlist).not.toHaveBeenCalled();
  });
});
