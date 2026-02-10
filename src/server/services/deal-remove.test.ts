import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { getDealForRemove, removeDeal } from "./deal-remove";

function createUpdateChain({ result }: { result: any }) {
  const chain: any = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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

describe("deal-remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDealForRemove", () => {
    it("returns 404 when deal is missing", async () => {
      const selectChain = createSelectChain({ result: { data: null, error: null } });
      vi.mocked(getSupabaseServiceClient).mockReturnValue({ from: () => selectChain } as any);
      await expect(getDealForRemove({ dealId: "00000000-0000-4000-a000-000000000123" })).rejects.toMatchObject({
        status: 404,
        code: "DEAL_NOT_FOUND"
      });
    });
  });

  describe("removeDeal", () => {
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

    it("forbids non-creator agent", async () => {
      await expect(
        removeDeal({
          dealId,
          agentId,
          existing: { ...baseExisting, creator_agent_id: "22222222-2222-4222-8222-222222222222" }
        })
      ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
      expect(getSupabaseServiceClient).not.toHaveBeenCalled();
    });

    it("blocks when status is not NEW", async () => {
      await expect(
        removeDeal({
          dealId,
          agentId,
          existing: { ...baseExisting, status: "ACTIVE" }
        })
      ).rejects.toMatchObject({ status: 409, code: "DEAL_NOT_REMOVABLE" });
      expect(getSupabaseServiceClient).not.toHaveBeenCalled();
    });

    it("blocks after votes", async () => {
      await expect(
        removeDeal({
          dealId,
          agentId,
          existing: { ...baseExisting, votes_down: 1 }
        })
      ).rejects.toMatchObject({ status: 409, code: "DEAL_NOT_REMOVABLE" });
      expect(getSupabaseServiceClient).not.toHaveBeenCalled();
    });

    it("blocks after activation window", async () => {
      const now = new Date("2026-02-10T12:10:00.000Z");
      await expect(
        removeDeal({
          dealId,
          agentId,
          existing: { ...baseExisting, new_until: "2026-02-10T12:09:59.000Z" },
          now
        })
      ).rejects.toMatchObject({ status: 409, code: "DEAL_NOT_REMOVABLE" });
      expect(getSupabaseServiceClient).not.toHaveBeenCalled();
    });

    it("marks deal as REMOVED", async () => {
      const now = new Date("2026-02-10T12:05:00.000Z");
      const updateChain = createUpdateChain({
        result: {
          data: { deal_id: dealId, status: "REMOVED", updated_at: now.toISOString() },
          error: null
        }
      });
      const client: any = { from: vi.fn(() => updateChain) };
      vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

      const result = await removeDeal({ dealId, agentId, existing: baseExisting, now });
      expect(result.status).toBe("REMOVED");
      expect(client.from).toHaveBeenCalledWith("deals");
      expect(updateChain.update).toHaveBeenCalledWith({
        status: "REMOVED",
        updated_at: now.toISOString()
      });
      expect(updateChain.eq).toHaveBeenCalledWith("deal_id", dealId);
      expect(updateChain.eq).toHaveBeenCalledWith("creator_agent_id", agentId);
      expect(updateChain.eq).toHaveBeenCalledWith("status", "NEW");
    });

    it("returns DEAL_NOT_REMOVABLE when update races and returns no row", async () => {
      const updateChain = createUpdateChain({ result: { data: null, error: null } });
      vi.mocked(getSupabaseServiceClient).mockReturnValue({ from: () => updateChain } as any);

      await expect(removeDeal({ dealId, agentId, existing: baseExisting })).rejects.toMatchObject({
        status: 409,
        code: "DEAL_NOT_REMOVABLE"
      });
    });
  });
});

