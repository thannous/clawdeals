import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { resetSandboxFixtures } from "./sandbox-fixtures";

function createThenableChain({ value }: { value: any }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn((resolve) => resolve(value))
  };
  return chain;
}

describe("resetSandboxFixtures", () => {
  const prevEnv = process.env.CLAWDEALS_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLAWDEALS_ENV = "sandbox";
  });

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env.CLAWDEALS_ENV;
    } else {
      process.env.CLAWDEALS_ENV = prevEnv;
    }
  });

  it("ages the authenticated agent out of quarantine", async () => {
    const now = new Date("2026-02-09T00:00:00.000Z");
    const agentId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

    const agentsChain = createThenableChain({ value: { data: [], error: null } });
    agentsChain.maybeSingle.mockResolvedValue({
      data: { trust_flags: ["unverified_owner", "quarantined"] },
      error: null
    });

    const watchlistsChain = createThenableChain({ value: { data: [], error: null } });
    const listingsChain = createThenableChain({ value: { data: [], error: null } });
    const dealsChain = createThenableChain({ value: { data: [], error: null } });

    const client: any = {
      from: vi.fn((table: string) => {
        if (table === "agents") return agentsChain;
        if (table === "watchlists") return watchlistsChain;
        if (table === "listings") return listingsChain;
        if (table === "deals") return dealsChain;
        return createThenableChain({ value: { data: [], error: null } });
      })
    };

    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    await resetSandboxFixtures({ agentId, now });

    const expectedCreatedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const expectedNowIso = now.toISOString();

    expect(agentsChain.update).toHaveBeenCalledWith({
      created_at: expectedCreatedAt,
      trust_flags: ["unverified_owner"],
      trust_updated_at: expectedNowIso,
      updated_at: expectedNowIso
    });
    expect(agentsChain.eq).toHaveBeenCalledWith("id", agentId);
  });

  it("seeds deals and listings with media payloads", async () => {
    const now = new Date("2026-02-09T00:00:00.000Z");
    const agentId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

    const agentsChain = createThenableChain({ value: { data: [], error: null } });
    agentsChain.maybeSingle.mockResolvedValue({
      data: { trust_flags: ["unverified_owner", "quarantined"] },
      error: null
    });

    const watchlistsChain = createThenableChain({ value: { data: [], error: null } });
    const listingsChain = createThenableChain({ value: { data: [], error: null } });
    const dealsChain = createThenableChain({ value: { data: [], error: null } });

    const client: any = {
      from: vi.fn((table: string) => {
        if (table === "agents") return agentsChain;
        if (table === "watchlists") return watchlistsChain;
        if (table === "listings") return listingsChain;
        if (table === "deals") return dealsChain;
        return createThenableChain({ value: { data: [], error: null } });
      })
    };

    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    await resetSandboxFixtures({ agentId, now });

    const dealsPayload = dealsChain.insert.mock.calls[0]?.[0];
    expect(Array.isArray(dealsPayload)).toBe(true);
    expect(dealsPayload.length).toBeGreaterThan(0);
    for (const item of dealsPayload) {
      expect(Array.isArray(item.images)).toBe(true);
      expect(item.images.length).toBeGreaterThan(0);
      expect(Number.isInteger(item.cover_image_index)).toBe(true);
    }

    const listingsPayload = listingsChain.insert.mock.calls[0]?.[0];
    expect(Array.isArray(listingsPayload)).toBe(true);
    expect(listingsPayload.length).toBeGreaterThan(0);
    for (const item of listingsPayload) {
      expect(Array.isArray(item.photos)).toBe(true);
      expect(item.photos.length).toBeGreaterThan(0);
      expect(Number.isInteger(item.cover_image_index)).toBe(true);
    }
  });
});
