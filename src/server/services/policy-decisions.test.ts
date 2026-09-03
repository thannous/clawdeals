import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { listPolicyDecisionsForOwner } from "./policy-decisions";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_AGENT_ID = "22222222-2222-4222-8222-222222222222";

function makeBuilder(result: any) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result)
  };
  return builder;
}

describe("listPolicyDecisionsForOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns decisions for the policy owner and falls back to legacy actor ownership", async () => {
    const agents = makeBuilder({ data: [{ id: OWNER_AGENT_ID }], error: null });
    const modernAudit = makeBuilder({
      data: [
        {
          id: "audit-policy-owned",
          occurred_at: "2026-09-03T12:30:00.000Z",
          actor: { type: "agent", id: "33333333-3333-4333-8333-333333333333" },
          action: {
            event: "offer.create",
            entity_type: "offer",
            entity_id: "offer-2"
          },
          outcome: "BLOCKED",
          request_id: "req-policy-owned",
          policy: {
            decision: "REQUIRES_APPROVAL",
            policy_version: 4,
            owner_id: OWNER_ID
          }
        }
      ],
      error: null
    });
    const legacyAudit = makeBuilder({
      data: [
        {
          id: "audit-owned",
          occurred_at: "2026-09-03T12:00:00.000Z",
          actor: { type: "agent", id: OWNER_AGENT_ID },
          action: {
            event: "offer.create",
            entity_type: "offer",
            entity_id: "offer-1"
          },
          outcome: "SUCCESS",
          request_id: "req-owned",
          policy: { decision: "AUTO_APPROVED", policy_version: 3 }
        },
        {
          id: "audit-other-owner",
          occurred_at: "2026-09-03T10:00:00.000Z",
          actor: { type: "agent", id: "33333333-3333-4333-8333-333333333333" },
          action: { event: "offer.create" },
          outcome: "BLOCKED",
          request_id: "req-other",
          policy: { decision: "REQUIRES_APPROVAL", policy_version: 4 }
        }
      ],
      error: null
    });
    const from = vi.fn().mockReturnValueOnce(agents).mockReturnValueOnce(modernAudit).mockReturnValueOnce(legacyAudit);
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from } as any);

    const decisions = await listPolicyDecisionsForOwner({
      ownerId: OWNER_ID,
      limit: 20
    });

    expect(decisions).toEqual([
      expect.objectContaining({
        decision_id: "audit-policy-owned",
        decision: "REQUIRES_APPROVAL",
        request_id: "req-policy-owned"
      }),
      expect.objectContaining({
        decision_id: "audit-owned",
        agent_id: OWNER_AGENT_ID,
        decision: "AUTO_APPROVED",
        request_id: "req-owned",
        receipt_url: "/api/v1/owner/policy-decisions?request_id=req-owned"
      })
    ]);
    expect(modernAudit.eq).toHaveBeenCalledWith("policy->>owner_id", OWNER_ID);
    expect(legacyAudit.is).toHaveBeenCalledWith("policy->>owner_id", null);
    expect(legacyAudit.in).toHaveBeenCalledWith("actor->>id", [OWNER_AGENT_ID]);
    expect(modernAudit.not).toHaveBeenCalledWith("policy->>decision", "is", null);
    expect(legacyAudit.neq).toHaveBeenCalledWith("policy->>decision", "N_A");
  });

  it("applies request_id before returning a receipt and keeps owner isolation", async () => {
    const agents = makeBuilder({ data: [{ id: OWNER_AGENT_ID }], error: null });
    const modernAudit = makeBuilder({ data: [], error: null });
    const legacyAudit = makeBuilder({ data: [], error: null });
    const from = vi.fn().mockReturnValueOnce(agents).mockReturnValueOnce(modernAudit).mockReturnValueOnce(legacyAudit);
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from } as any);

    await expect(
      listPolicyDecisionsForOwner({
        ownerId: OWNER_ID,
        requestId: "req-secret",
        limit: 1
      })
    ).resolves.toEqual([]);
    expect(modernAudit.eq).toHaveBeenCalledWith("request_id", "req-secret");
    expect(legacyAudit.eq).toHaveBeenCalledWith("request_id", "req-secret");
  });

  it("still scans policy-owned decisions when the owner currently has no agents", async () => {
    const agents = makeBuilder({ data: [], error: null });
    const modernAudit = makeBuilder({ data: [], error: null });
    const from = vi.fn().mockReturnValueOnce(agents).mockReturnValueOnce(modernAudit);
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from } as any);

    await expect(listPolicyDecisionsForOwner({ ownerId: OWNER_ID })).resolves.toEqual([]);
    expect(from).toHaveBeenCalledTimes(2);
    expect(modernAudit.eq).toHaveBeenCalledWith("policy->>owner_id", OWNER_ID);
  });
});
