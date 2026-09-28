import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("./agents", () => ({
  addAgentTrustFlag: vi.fn()
}));

import { resolveReport } from "./report-moderation";
import { getSupabaseServiceClient } from "../db/supabase";

function mockClient(overrides: any = {}) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides
  };
  // Make chainable methods return chain
  for (const key of ["from", "select", "insert", "update", "upsert", "eq", "neq", "or", "order", "limit"]) {
    if (!overrides[key]) {
      chain[key] = vi.fn().mockReturnValue(chain);
    }
  }
  vi.mocked(getSupabaseServiceClient).mockReturnValue(chain);
  return chain;
}

describe("resolveReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rolls back resolution when confirm side-effects fail", async () => {
    const resolved = {
      report_id: "r1",
      status: "CONFIRMED",
      entity_type: "deal",
      entity_id: "d1"
    };
    const chain = mockClient();
    // First maybeSingle: report update to CONFIRMED
    chain.maybeSingle
      .mockResolvedValueOnce({ data: resolved, error: null })
      // Second maybeSingle: rollback update
      .mockResolvedValueOnce({ data: { report_id: "r1" }, error: null });

    chain.upsert.mockReturnValue({ error: { message: "upsert failed" } });

    await expect(
      resolveReport({
        reportId: "r1",
        action: "confirm",
        reason: "spam",
        resolvedBy: "owner-1"
      })
    ).rejects.toMatchObject({ code: "ENFORCEMENT_FAILED", status: 500 });

    // Ensure we attempted to roll back the report to UNCONFIRMED
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "UNCONFIRMED",
        resolved_by: null,
        resolved_at: null,
        resolved_reason: null
      })
    );
  });
});
