import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({ getSupabaseServiceClient: vi.fn() }));
vi.mock("../policy/buy-mission-guard", () => ({ enforceBuyMissionOffer: vi.fn() }));
vi.mock("./policies", () => ({ getPolicyOrDefault: vi.fn() }));
vi.mock("../policy/evaluate", () => ({ evaluatePolicyAction: vi.fn() }));

import { getSupabaseServiceClient } from "../db/supabase";
import { enforceBuyMissionOffer } from "../policy/buy-mission-guard";
import { evaluatePolicyAction } from "../policy/evaluate";
import { getPolicyOrDefault } from "./policies";
import { editPendingMissionOfferApproval } from "./approvals";

const OWNER_ID = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const APPROVAL_ID = "a2cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const MISSION_ID = "b2cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const AGENT_ID = "d2cb3c39-7e2f-4c2d-9d0b-53b77339b8de";

function approval() {
  return {
    approval_id: APPROVAL_ID,
    owner_id: OWNER_ID,
    state: "PENDING",
    action_type: "offer_over_budget",
    action_ref: {
      mission_id: MISSION_ID,
      agent_id: AGENT_ID,
      amount: 1350,
      currency: "EUR",
      expires_at: "2026-08-27T10:00:00.000Z"
    },
    action_payload_redacted: {
      offer: {
        amount: 1350,
        currency: "EUR",
        expires_at: "2026-08-27T10:00:00.000Z"
      },
      policy: { reason: "hard_budget_exceeded", hard_budget_max: 1300 }
    }
  };
}

function updateChain(data: any) {
  const chain: any = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null })
  };
  return chain;
}

describe("editable mission offer approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(enforceBuyMissionOffer).mockResolvedValue({
      mission: { hard_budget_max: 1300, currency: "EUR" }
    } as any);
    vi.mocked(getPolicyOrDefault).mockResolvedValue({ policy_json: { version: 2 } } as any);
    vi.mocked(evaluatePolicyAction).mockReturnValue({
      decision: "ALLOW",
      policy_version: 2,
      reason: null
    } as any);
  });

  it("fails closed when the pending row changed before the edit", async () => {
    const chain = updateChain(null);
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from: vi.fn(() => chain) } as any);

    await expect(
      editPendingMissionOfferApproval({
        approval: approval(),
        ownerId: OWNER_ID,
        amount: 1290,
        now: new Date("2026-08-26T10:00:00.000Z")
      })
    ).rejects.toMatchObject({ code: "APPROVAL_STALE", status: 409 });
  });

  it("fails closed when the mission is inactive rather than merely outside delegation", async () => {
    vi.mocked(enforceBuyMissionOffer).mockRejectedValue(
      Object.assign(new Error("Buy mission is not active"), {
        code: "MISSION_NOT_ACTIVE",
        status: 409
      })
    );
    const client = { from: vi.fn() };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client as any);

    await expect(
      editPendingMissionOfferApproval({
        approval: approval(),
        ownerId: OWNER_ID,
        amount: 1290,
        now: new Date("2026-08-26T10:00:00.000Z")
      })
    ).rejects.toMatchObject({ code: "MISSION_NOT_ACTIVE" });
    expect(client.from).not.toHaveBeenCalled();
  });
});
