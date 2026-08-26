import { describe, expect, it, vi } from "vitest";

vi.mock("../services/approvals", () => ({
  createApproval: vi.fn()
}));

import { createApproval } from "../services/approvals";
import { createBuyMissionOfferApproval } from "./buy-mission-approval";

describe("buy mission offer approval", () => {
  it("creates a deterministic owner-scoped and redacted approval request", async () => {
    vi.mocked(createApproval).mockResolvedValue({ approval_id: "approval-1" } as any);
    const input = {
      ownerId: "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de",
      agentId: "d2cb3c39-7e2f-4c2d-9d0b-53b77339b8de",
      missionId: "b2cb3c39-7e2f-4c2d-9d0b-53b77339b8de",
      previousOfferId: "a2cb3c39-7e2f-4c2d-9d0b-53b77339b8de",
      threadId: "e2cb3c39-7e2f-4c2d-9d0b-53b77339b8de",
      listingId: "f2cb3c39-7e2f-4c2d-9d0b-53b77339b8de",
      buyerAgentId: "12cb3c39-7e2f-4c2d-9d0b-53b77339b8de",
      sellerAgentId: "22cb3c39-7e2f-4c2d-9d0b-53b77339b8de",
      amount: 1350,
      currency: "EUR",
      expiresAt: "2026-08-27T10:00:00.000Z",
      reason: "hard_budget_exceeded",
      hardBudgetMax: 1300
    };

    await expect(createBuyMissionOfferApproval(input)).resolves.toEqual({
      approval_id: "approval-1"
    });
    expect(createApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: input.ownerId,
        actionType: "offer_over_budget",
        actionRefId: expect.stringMatching(/^[0-9a-f]{64}$/),
        actionRef: expect.objectContaining({
          mission_id: input.missionId,
          previous_offer_id: input.previousOfferId,
          amount: 1350,
          currency: "EUR"
        }),
        actionPayload: {
          offer: {
            amount: 1350,
            currency: "EUR",
            expires_at: "2026-08-27T10:00:00.000Z"
          },
          policy: {
            decision: "REQUIRES_APPROVAL",
            reason: "hard_budget_exceeded",
            hard_budget_max: 1300
          },
          consequence: "Sends a binding counteroffer. No contact information is shared."
        },
        createdByAgentId: input.agentId
      })
    );
  });
});
