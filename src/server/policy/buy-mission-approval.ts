import crypto from "crypto";

import { createApproval } from "../services/approvals";
import { canonicalJsonStringify } from "../utils/canonical-json";

type BuyMissionOfferApprovalInput = {
  ownerId: string;
  agentId: string;
  missionId: string;
  previousOfferId: string;
  threadId: string;
  listingId: string;
  buyerAgentId: string;
  sellerAgentId: string;
  amount: number;
  currency: string;
  expiresAt: string;
  reason: string;
  hardBudgetMax?: number | null;
};

export async function createBuyMissionOfferApproval(input: BuyMissionOfferApprovalInput) {
  const actionRef = {
    owner_id: input.ownerId,
    agent_id: input.agentId,
    mission_id: input.missionId,
    requested_action: "counter",
    previous_offer_id: input.previousOfferId,
    thread_id: input.threadId,
    listing_id: input.listingId,
    buyer_agent_id: input.buyerAgentId,
    seller_agent_id: input.sellerAgentId,
    amount: input.amount,
    currency: input.currency,
    expires_at: input.expiresAt,
    policy_reason: input.reason
  };
  const actionRefId = crypto
    .createHash("sha256")
    .update(
      canonicalJsonStringify({
        mission_id: input.missionId,
        previous_offer_id: input.previousOfferId,
        agent_id: input.agentId,
        amount: input.amount,
        currency: input.currency,
        expires_at: input.expiresAt
      })
    )
    .digest("hex");

  return createApproval({
    ownerId: input.ownerId,
    actionType: "offer_over_budget",
    actionRef,
    actionRefId,
    actionPayload: {
      offer: {
        amount: input.amount,
        currency: input.currency,
        expires_at: input.expiresAt
      },
      policy: {
        decision: "REQUIRES_APPROVAL",
        reason: input.reason,
        hard_budget_max: input.hardBudgetMax ?? null
      },
      consequence: "Sends a binding counteroffer. No contact information is shared."
    },
    createdByAgentId: input.agentId
  });
}
