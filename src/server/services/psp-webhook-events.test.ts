import { beforeEach, describe, expect, it, vi } from "vitest";

describe("psp-webhook-events", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("dedupes webhook events using Postgres unique-violation code (23505)", async () => {
    const existingRow = {
      id: "row-1",
      psp_provider: "mock",
      psp_event_id: "evt_1",
      type: "payment.succeeded",
      status: "RECEIVED",
      escrow_id: null,
      psp_external_account_id: null,
      payload: {},
      error: null,
      received_at: "2026-02-09T00:00:00Z",
      applied_at: null
    };

    const insertResult = { data: null, error: { code: "23505", message: "unique violation" } };
    const fetchExistingResult = { data: existingRow, error: null };

    const fromMock = vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => insertResult)
        }))
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => fetchExistingResult)
          }))
        }))
      }))
    }));

    vi.doMock("../db/supabase", () => ({
      getSupabaseServiceClient: () => ({ from: fromMock })
    }));

    const { insertPspWebhookEvent } = await import("./psp-webhook-events");
    const result = await insertPspWebhookEvent({
      provider: "mock",
      eventId: "evt_1",
      type: "payment.succeeded",
      payload: {}
    });

    expect(result.ok).toBe(true);
    expect(result.duplicate).toBe(true);
    expect(result.row.id).toBe("row-1");
  });

  it("claims orphaned PENDING_RETRY events by matching payload.data.<id> fields", async () => {
    const containsCalls: any[] = [];

    const fromMock = vi.fn(() => ({
      update: vi.fn(() => ({
        is: vi.fn(() => ({
          eq: vi.fn(() => ({
            contains: vi.fn((column: string, needle: any) => {
              containsCalls.push({ column, needle });
              const field = Object.keys(needle?.data || {})[0];
              const count =
                field === "payment_id" ? 2 :
                field === "payout_id" ? 1 :
                field === "refund_id" ? 3 :
                0;
              return {
                select: vi.fn(async () => ({ data: Array.from({ length: count }).map((_, i) => ({ id: `${field}-${i}` })), error: null }))
              };
            })
          }))
        }))
      }))
    }));

    vi.doMock("../db/supabase", () => ({
      getSupabaseServiceClient: () => ({ from: fromMock })
    }));

    const { claimOrphanedPspWebhookEvents } = await import("./psp-webhook-events");
    const claimed = await claimOrphanedPspWebhookEvents({
      escrowId: "00000000-0000-4000-a000-000000000000",
      paymentId: "pay_123",
      payoutId: "po_456",
      refundId: "re_789"
    });

    expect(claimed).toBe(6);
    expect(containsCalls).toEqual([
      { column: "payload", needle: { data: { payment_id: "pay_123" } } },
      { column: "payload", needle: { data: { payout_id: "po_456" } } },
      { column: "payload", needle: { data: { refund_id: "re_789" } } }
    ]);
  });
});

