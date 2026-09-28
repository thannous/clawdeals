import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { applyDealUpdate, getDealForUpdate } from "./deal-update";

function createUpdateChain({ result }: { result: any }) {
  const chain: any = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => result)
  };
  return chain;
}

function createSelectChain({ result }: { result: any }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => result)
  };
  return chain;
}

describe("deal-update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDealForUpdate", () => {

    it("falls back to legacy schema when media columns are missing", async () => {
      const firstChain = createSelectChain({
        result: { data: null, error: { message: "column deals.images does not exist" } }
      });
      const secondChain = createSelectChain({
        result: {
          data: {
            deal_id: "00000000-0000-4000-a000-000000000123",
            creator_agent_id: "11111111-1111-4111-8111-111111111111",
            status: "NEW",
            votes_up: 0,
            votes_down: 0,
            created_at: "2026-02-10T12:00:00Z",
            new_until: "2026-02-10T12:10:00Z"
          },
          error: null
        }
      });
      const fromMock = vi.fn().mockReturnValueOnce(firstChain).mockReturnValueOnce(secondChain);
      vi.mocked(getSupabaseServiceClient).mockReturnValue({ from: fromMock } as any);

      const result = await getDealForUpdate({ dealId: "00000000-0000-4000-a000-000000000123" });
      expect(result.images).toBeNull();
      expect(result.cover_image_index).toBeNull();
    });
  });

  describe("applyDealUpdate", () => {
    const dealId = "00000000-0000-4000-a000-000000000123";
    const agentId = "11111111-1111-4111-8111-111111111111";

    const baseExisting: any = {
      deal_id: dealId,
      creator_agent_id: agentId,
      status: "NEW",
      votes_up: 0,
      votes_down: 0,
      created_at: "2026-02-10T12:00:00Z",
      new_until: "2026-02-10T12:10:00Z"
    };

    it("falls back to legacy schema for non-media updates when media columns are missing", async () => {
      const firstUpdateChain = createUpdateChain({
        result: { data: null, error: { message: "column deals.images does not exist" } }
      });
      const secondUpdateChain = createUpdateChain({
        result: {
          data: {
            deal_id: dealId,
            title: "Updated",
            source_url: "https://example.com/deal",
            price: "9.99",
            currency: "EUR",
            expires_at: "2026-02-11T12:00:00Z",
            status: "NEW",
            temperature: null,
            votes_up: 0,
            votes_down: 0,
            tags: [],
            created_at: baseExisting.created_at
          },
          error: null
        }
      });
      const fromMock = vi.fn().mockReturnValueOnce(firstUpdateChain).mockReturnValueOnce(secondUpdateChain);
      vi.mocked(getSupabaseServiceClient).mockReturnValue({ from: fromMock } as any);

      const result = await applyDealUpdate({
        dealId,
        agentId,
        patch: { price: 9.99 },
        existing: baseExisting,
        now: new Date("2026-02-10T12:05:00.000Z")
      });
      expect(result.deal_id).toBe(dealId);
      expect(fromMock).toHaveBeenCalledTimes(2);
    });

    it("returns FEATURE_UNAVAILABLE when media update is requested on legacy schema", async () => {
      const firstUpdateChain = createUpdateChain({
        result: { data: null, error: { message: "column deals.images does not exist" } }
      });
      const fromMock = vi.fn().mockReturnValue(firstUpdateChain);
      vi.mocked(getSupabaseServiceClient).mockReturnValue({ from: fromMock } as any);

      await expect(
        applyDealUpdate({
          dealId,
          agentId,
          patch: { images: [{ storage_key: "deals/d-1/1.jpg", mime: "image/jpeg" }] },
          existing: baseExisting,
          now: new Date("2026-02-10T12:05:00.000Z")
        })
      ).rejects.toMatchObject({ status: 503, code: "FEATURE_UNAVAILABLE" });
      expect(fromMock).toHaveBeenCalledTimes(1);
    });
  });
});
