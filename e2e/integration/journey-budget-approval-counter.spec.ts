import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, createOffer, createCounterOffer, acceptOffer, expectStatus } from "./helpers/http";
import {
  createSupabaseAdmin,
  ensureOwnerDb,
  createAgentDbWithOverrides,
  createActiveApiKeyDb
} from "./helpers/supabase";

assertIntegrationEnv();

function extractApprovalId(body: any): string | null {
  if (!body || typeof body !== "object") return null;
  const details = body?.error?.details;
  if (details && typeof details === "object") {
    const fromDetails = (details as any).approval_id;
    if (typeof fromDetails === "string" && fromDetails) return fromDetails;
  }
  return null;
}

async function setupPolicy(request: any, ownerId: string) {
  const policyRes = await request.put("/api/v1/policies", {
    headers: { "x-owner-id": ownerId },
    data: {
      budgets: { max_offer: 400, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
      auto_approve: { message_types: ["question", "answer", "info"], actions: ["listing.create", "thread.create"] },
      allowlist_agent_ids: [],
      denylist_agent_ids: []
    }
  });
  await expectStatus(policyRes, 200);
}

test.describe.serial("Integration journey: Budget approval + counter + accept (TI-293)", () => {
  test.setTimeout(90000);

  test("over-budget offer -> approval -> counter chain -> accept", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const sellerOwnerId = randomId();
    await ensureOwnerDb(supabase, sellerOwnerId);
    await setupPolicy(request, sellerOwnerId);
    const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, {
      createdAt: agedCreatedAt,
      trustScore: 90,
      trustFlags: []
    });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, {
      createdAt: agedCreatedAt,
      trustScore: 90,
      trustFlags: []
    });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const listingRes = await createListing(request, sellerApiKey, {
      title: `TI-293 budget journey ${randomId()}`,
      category: `ti293_budget_${randomId()}`,
      price: { amount: 500, currency: "EUR" },
      publish: true
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;
    expect(listingBody.status).toBe("LIVE");

    // Create a thread explicitly so we can find the approved offer deterministically.
    const threadRes = await request.post(`/api/v1/listings/${encodeURIComponent(listingId)}/threads`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(threadRes, 201);
    const threadBody = await threadRes.json();
    const threadId = threadBody.thread_id;
    expect(typeof threadId).toBe("string");

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const offerRes = await createOffer(
      request,
      buyerApiKey,
      listingId,
      { threadId, amount: 500, currency: "EUR", expiresAt },
      { idempotencyKey: randomId() }
    );
    await expectStatus(offerRes, 409);
    const offerBody = await offerRes.json();
    expect(offerBody?.error?.code).toBe("APPROVAL_REQUIRED");

    const approvalId = extractApprovalId(offerBody);
    expect(approvalId).toBeTruthy();

    const { data: approvalRow, error: approvalErr } = await supabase
      .from("approvals")
      .select("approval_id,action_type,state,owner_id")
      .eq("approval_id", approvalId)
      .maybeSingle();
    if (approvalErr) throw approvalErr;
    expect(approvalRow?.approval_id).toBe(approvalId);
    expect(approvalRow?.action_type).toBe("offer_over_budget");
    expect(approvalRow?.state).toBe("PENDING");
    expect(approvalRow?.owner_id).toBe(sellerOwnerId);

    const approveRes = await request.post(`/api/v1/approvals/${approvalId}:approve`, {
      headers: { "x-owner-id": sellerOwnerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(approveRes, 200);

    const { data: offers, error: offersErr } = await supabase
      .from("offers")
      .select("offer_id,status,amount,currency,thread_id,listing_id,created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (offersErr) throw offersErr;
    expect((offers || []).length).toBe(1);
    const approvedOffer = offers[0];
    expect(approvedOffer.status).toBe("CREATED");
    expect(approvedOffer.amount).toBe(500);
    expect(approvedOffer.currency).toBe("EUR");
    expect(approvedOffer.listing_id).toBe(listingId);

    // Negotiate under budget to avoid another approval step here.
    const expiresAt2 = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const sellerCounterRes = await createCounterOffer(
      request,
      sellerApiKey,
      approvedOffer.offer_id,
      { amount: 390, currency: "EUR", expiresAt: expiresAt2 },
      { idempotencyKey: randomId() }
    );
    await expectStatus(sellerCounterRes, 201);
    const sellerCounterBody = await sellerCounterRes.json();
    const sellerCounterOfferId = sellerCounterBody.offer_id;

    const expiresAt3 = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const buyerCounterRes = await createCounterOffer(
      request,
      buyerApiKey,
      sellerCounterOfferId,
      { amount: 395, currency: "EUR", expiresAt: expiresAt3 },
      { idempotencyKey: randomId() }
    );
    await expectStatus(buyerCounterRes, 201);
    const buyerCounterBody = await buyerCounterRes.json();
    const finalOfferId = buyerCounterBody.offer_id;

    const acceptRes = await acceptOffer(request, sellerApiKey, finalOfferId, { idempotencyKey: randomId() });
    await expectStatus(acceptRes, 200);
    const acceptBody = await acceptRes.json();
    expect(acceptBody.offer_id).toBe(finalOfferId);
    expect(acceptBody.status).toBe("ACCEPTED");
    expect(acceptBody.transaction?.tx_id).toBeTruthy();
    expect(acceptBody.transaction?.buyer_agent_id).toBe(buyerAgent.id);
    expect(acceptBody.transaction?.seller_agent_id).toBe(sellerAgent.id);

    const { data: listingRow, error: listingErr } = await supabase
      .from("listings")
      .select("status,reserved_at")
      .eq("listing_id", listingId)
      .maybeSingle();
    if (listingErr) throw listingErr;
    expect(listingRow?.status).toBe("RESERVED");
    expect(listingRow?.reserved_at).toBeTruthy();
  });
});

