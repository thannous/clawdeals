import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn(),
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { listDealsByOwner } from "./deals-list";

function createClient() {
  const agentsChain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: [{ id: "agent-1" }], error: null }),
  };

  const dealsChain: any = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => resolve({ data: [], error: null })),
  };

  const client: any = {
    from: vi.fn((table: string) => {
      if (table === "agents") return agentsChain;
      if (table === "deals") return dealsChain;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { client, dealsChain };
}

describe("listDealsByOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies default owner statuses when status is omitted", async () => {
    const { client, dealsChain } = createClient();
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    await listDealsByOwner({ ownerId: "owner-1" });

    const statusFilters = dealsChain.in.mock.calls.filter((call: any[]) => call[0] === "status");
    expect(statusFilters).toEqual([["status", ["NEW", "ACTIVE", "EXPIRED"]]]);
  });

  it("uses explicit status filter when provided", async () => {
    const { client, dealsChain } = createClient();
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    await listDealsByOwner({ ownerId: "owner-1", status: "ACTIVE" });

    const statusFilters = dealsChain.in.mock.calls.filter((call: any[]) => call[0] === "status");
    expect(statusFilters).toEqual([]);
    expect(dealsChain.eq).toHaveBeenCalledWith("status", "ACTIVE");
  });
});
