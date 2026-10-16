import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({ getSupabaseServiceClient: vi.fn() }));

import { getSupabaseServiceClient } from "../db/supabase";
import { listOffersByAgent } from "./offers";

const getClientMock = vi.mocked(getSupabaseServiceClient);
const agentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerId = "11111111-1111-4111-8111-111111111111";

function fixture(offers: any[], listings: any[], listingsError: any = null) {
  const offersQuery: any = {
    select: vi.fn(() => offersQuery),
    order: vi.fn(() => offersQuery),
    limit: vi.fn(() => offersQuery),
    or: vi.fn(() => offersQuery),
    eq: vi.fn(() => offersQuery),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: offers, error: null }).then(resolve),
  };
  const listingsQuery = {
    select: vi.fn(() => listingsQuery),
    in: vi.fn().mockResolvedValue({ data: listings, error: listingsError }),
  };
  const from = vi.fn((table: string) => table === "offers" ? offersQuery : listingsQuery);
  getClientMock.mockReturnValue({ from } as any);
  return { from, offersQuery, listingsQuery };
}

// Client E2E seams cannot prove that the privileged lookup stays restricted to
// the participant's returned page or that private listing fields stay private.
describe("listOffersByAgent listing availability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enriches only the participant-scoped page and exposes no private listing fields", async () => {
    const { offersQuery, listingsQuery } = fixture([
      { offer_id: "offer-1", listing_id: "listing-1", status: "CREATED" },
      { offer_id: "offer-2", listing_id: "listing-2", status: "ACCEPTED", created_at: "2026-10-14T10:00:00Z" },
      { offer_id: "next-page-offer", listing_id: "next-page-listing" },
    ], [
      { listing_id: "listing-1", status: "LIVE", owner_id: "another-owner", description: "private listing details" },
      { listing_id: "listing-2", status: "RESERVED", owner_id: ownerId },
    ]);

    const result = await listOffersByAgent({ agentIds: [agentId], ownerId, limit: 2 });

    expect(offersQuery.or).toHaveBeenCalledWith(`buyer_agent_id.in.("${agentId}"),seller_agent_id.in.("${agentId}")`);
    expect(listingsQuery.select).toHaveBeenCalledWith("listing_id,status,owner_id");
    expect(listingsQuery.in).toHaveBeenCalledWith("listing_id", ["listing-1", "listing-2"]);
    expect(result.items).toEqual([
      { offer_id: "offer-1", listing_id: "listing-1", status: "CREATED", listing_status: "LIVE", owner_listing_available: false },
      { offer_id: "offer-2", listing_id: "listing-2", status: "ACCEPTED", created_at: "2026-10-14T10:00:00Z", listing_status: "RESERVED", owner_listing_available: true },
    ]);
    expect(result.nextCursor).toBeTruthy();
  });

  it("represents a missing listing without claiming it is public", async () => {
    fixture([{ offer_id: "offer-1", listing_id: "missing-listing" }], []);
    const result = await listOffersByAgent({ agentIds: [agentId] });
    expect(result.items[0].listing_status).toBeNull();
    expect(result.items[0].owner_listing_available).toBe(false);
  });

  it("does not read listings for an empty participant page", async () => {
    const { from } = fixture([], []);
    expect(await listOffersByAgent({ agentIds: [agentId] })).toEqual({ items: [], nextCursor: null });
    expect(from).not.toHaveBeenCalledWith("listings");
  });

  it("fails closed if listing availability cannot be read", async () => {
    fixture([{ offer_id: "offer-1", listing_id: "listing-1" }], [], { message: "availability unavailable" });
    await expect(listOffersByAgent({ agentIds: [agentId] })).rejects.toMatchObject({ code: "DATABASE_ERROR" });
  });
});
