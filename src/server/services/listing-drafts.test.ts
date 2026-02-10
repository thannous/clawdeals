import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("./listings", () => ({
  createListing: vi.fn(),
  getListing: vi.fn()
}));

vi.mock("../config/listing-media", () => ({
  getMaxPhotosPerListing: vi.fn(() => 2)
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { createListing, getListing } from "./listings";
import { ensureActiveListingDraftForChannel, appendDraftListingPhoto, setDraftListingGeo } from "./listing-drafts";

function makeClient() {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    update: vi.fn(() => chain)
  };

  return {
    from: vi.fn(() => chain),
    __chain: chain
  };
}

describe("listing-drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a draft and stores active_listing_draft_id when none exists", async () => {
    const client = makeClient();
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client as any);

    client.__chain.maybeSingle
      .mockResolvedValueOnce({
        data: {
          channel_identity_id: "cid-1",
          owner_id: "owner-1",
          active_listing_draft_id: null
        },
        error: null
      })
      .mockResolvedValueOnce({
        data: { channel_identity_id: "cid-1", active_listing_draft_id: "l-1" },
        error: null
      });

    vi.mocked(createListing).mockResolvedValue({ listing_id: "l-1", status: "DRAFT", created_at: "t" } as any);
    vi.mocked(getListing).mockResolvedValue({ listing_id: "l-1", status: "DRAFT", owner_id: "owner-1", seller_agent_id: "agent-1", photos: [] } as any);

    const result = await ensureActiveListingDraftForChannel({
      ownerId: "owner-1",
      channelIdentityId: "cid-1",
      sellerAgentId: "agent-1"
    });

    expect(result.listingId).toBe("l-1");
    expect(createListing).toHaveBeenCalled();
    expect(client.from).toHaveBeenCalledWith("channel_identities");
  });

  it("reuses an existing draft when valid", async () => {
    const client = makeClient();
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client as any);

    client.__chain.maybeSingle
      .mockResolvedValueOnce({
        data: {
          channel_identity_id: "cid-1",
          owner_id: "owner-1",
          active_listing_draft_id: "l-1"
        },
        error: null
      })
      .mockResolvedValueOnce({
        data: { channel_identity_id: "cid-1", active_listing_draft_id: "l-1" },
        error: null
      });

    vi.mocked(getListing).mockResolvedValue({ listing_id: "l-1", status: "DRAFT", owner_id: "owner-1", seller_agent_id: "agent-1", photos: [] } as any);

    const result = await ensureActiveListingDraftForChannel({
      ownerId: "owner-1",
      channelIdentityId: "cid-1",
      sellerAgentId: "agent-1"
    });

    expect(result.listingId).toBe("l-1");
    expect(createListing).not.toHaveBeenCalled();
  });

  it("appendDraftListingPhoto enforces max photos", async () => {
    const client = makeClient();
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client as any);

    vi.mocked(getListing).mockResolvedValue({
      listing_id: "l-1",
      status: "DRAFT",
      owner_id: "owner-1",
      seller_agent_id: "agent-1",
      photos: [{ storage_key: "a", mime: "image/jpeg" }, { storage_key: "b", mime: "image/jpeg" }]
    } as any);

    await expect(
      appendDraftListingPhoto({
        listingId: "l-1",
        sellerAgentId: "agent-1",
        photoRef: { storage_key: "c", mime: "image/jpeg" }
      })
    ).rejects.toMatchObject({ code: "PHOTO_LIMIT_EXCEEDED" });
  });

  it("appendDraftListingPhoto retries on update conflicts (concurrent appends)", async () => {
    const client = makeClient();
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client as any);

    vi.mocked(getListing)
      .mockResolvedValueOnce({
        listing_id: "l-1",
        status: "DRAFT",
        owner_id: "owner-1",
        seller_agent_id: "agent-1",
        updated_at: "2026-02-10T00:00:00.000Z",
        photos: []
      } as any)
      .mockResolvedValueOnce({
        listing_id: "l-1",
        status: "DRAFT",
        owner_id: "owner-1",
        seller_agent_id: "agent-1",
        updated_at: "2026-02-10T00:00:00.001Z",
        photos: [{ storage_key: "a", mime: "image/jpeg" }]
      } as any);

    client.__chain.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          listing_id: "l-1",
          title: "Untitled",
          status: "DRAFT",
          updated_at: "2026-02-10T00:00:00.002Z",
          photos: [
            { storage_key: "a", mime: "image/jpeg" },
            { storage_key: "b", mime: "image/jpeg" }
          ]
        },
        error: null
      });

    const result = await appendDraftListingPhoto({
      listingId: "l-1",
      sellerAgentId: "agent-1",
      photoRef: { storage_key: "b", mime: "image/jpeg" },
      now: new Date("2026-02-10T00:00:00.000Z")
    });

    expect(vi.mocked(getListing)).toHaveBeenCalledTimes(2);
    expect(client.__chain.update).toHaveBeenCalledTimes(2);
    expect((client.__chain.update.mock.calls[0]?.[0] as any)?.photos?.length).toBe(1);
    expect((client.__chain.update.mock.calls[1]?.[0] as any)?.photos?.length).toBe(2);
    expect(result.photosCount).toBe(2);
  });

  it("setDraftListingGeo validates ranges", async () => {
    vi.mocked(getListing).mockResolvedValue({
      listing_id: "l-1",
      status: "DRAFT",
      owner_id: "owner-1",
      seller_agent_id: "agent-1",
      photos: []
    } as any);

    await expect(
      setDraftListingGeo({
        listingId: "l-1",
        sellerAgentId: "agent-1",
        lat: 120,
        lng: 0
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
