import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/owner-listing-follows", () => ({
  createOwnerListingFollow: vi.fn(),
  deleteOwnerListingFollow: vi.fn(),
  listOwnerListingFollows: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/owner/watchlists";
import { handler as deleteHandler } from "../../../../pages/api/v1/owner/watchlists/[watchlist_id]";
import {
  createOwnerListingFollow,
  deleteOwnerListingFollow,
  listOwnerListingFollows
} from "../../../../server/services/owner-listing-follows";

const ownerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const listingId = "d2db4d40-8f3f-4d3e-ae1c-64c88440c9ef";

function ctx(overrides: any = {}) {
  return { actor: { type: "owner", id: ownerId }, ownerId, ...overrides };
}

describe("/api/v1/owner/watchlists", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists server follows for the signed-in owner", async () => {
    vi.mocked(listOwnerListingFollows).mockResolvedValue([{ watchlist_id: "watchlist-1" }] as any);
    const result: any = await handler({ method: "GET", query: { listing_id: listingId }, headers: {} }, null, ctx());
    expect(result.status).toBe(200);
    expect(result.body.data.watchlists).toHaveLength(1);
    expect(listOwnerListingFollows).toHaveBeenCalledWith({ ownerId, listingId });
  });

  it("creates a server follow idempotently", async () => {
    vi.mocked(createOwnerListingFollow).mockResolvedValue({ watchlist_id: "watchlist-1", created: true } as any);
    const result: any = await handler({
      method: "POST",
      query: {},
      headers: { "idempotency-key": "request-1" },
      body: { listing_id: listingId }
    }, null, ctx());
    expect(result.status).toBe(201);
    expect(createOwnerListingFollow).toHaveBeenCalledWith({ ownerId, listingId });
  });

  it("rejects anonymous and malformed requests", async () => {
    const unauthorized: any = await handler({ method: "GET", query: {}, headers: {} }, null, ctx({ actor: null, ownerId: null }));
    expect(unauthorized.status).toBe(401);
    const invalid: any = await handler({ method: "POST", query: {}, headers: {}, body: { listing_id: "bad" } }, null, ctx());
    expect(invalid.status).toBe(400);
  });

  it("removes an owner follow through its server watchlist", async () => {
    vi.mocked(deleteOwnerListingFollow).mockResolvedValue({ watchlist_id: listingId, active: false } as any);
    const result: any = await deleteHandler({
      method: "DELETE",
      query: { watchlist_id: listingId },
      headers: { "idempotency-key": "request-2" }
    }, null, ctx());

    expect(result.status).toBe(200);
    expect(deleteOwnerListingFollow).toHaveBeenCalledWith({ ownerId, watchlistId: listingId });
  });
});
