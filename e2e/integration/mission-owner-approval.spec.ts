import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";

import { assertIntegrationEnv, getApiBaseUrl } from "./helpers/env";
import { randomId } from "./helpers/ids";
import {
  acceptOffer,
  createCounterOffer,
  createListing,
  createOffer,
  expectStatus
} from "./helpers/http";
import { setupPolicyForOwner } from "./helpers/marketplace";
import {
  createActiveApiKeyDb,
  createAgentDbWithOverrides,
  createSupabaseAdmin,
  ensureOwnerDb
} from "./helpers/supabase";

assertIntegrationEnv();

async function loginOwner(api: APIRequestContext, email: string) {
  const start = await api.post("/api/v1/auth/login:start", { data: { email } });
  await expectStatus(start, 201);
  const started = await start.json();
  expect(started.data?.session_id).toBeTruthy();
  expect(started.data?.session_token).toBeTruthy();

  const confirm = await api.post("/api/v1/auth/login:confirm", {
    data: {
      session_id: started.data.session_id,
      token: started.data.session_token
    }
  });
  await expectStatus(confirm, 200);
  return started.data.owner_id as string;
}

test("mission exception is resolved only by its owner session with an editable amount", async ({
  request
}) => {
  test.setTimeout(60_000);
  const supabase = createSupabaseAdmin();
  const baseURL = getApiBaseUrl();
  const origin = new URL(baseURL).origin;
  const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

  const sellerOwnerId = randomId();
  await ensureOwnerDb(supabase, sellerOwnerId);
  await setupPolicyForOwner(request, sellerOwnerId, {
    budgets: { max_offer: 2000, currency: "EUR" },
    approval_thresholds: { offer_amount_gt: 2000, contact_reveal: "always" }
  });
  const seller = await createAgentDbWithOverrides(supabase, sellerOwnerId, {
    createdAt: agedCreatedAt
  });
  const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, seller.id);

  const buyerOwnerId = randomId();
  const buyerEmail = `itest+mission-owner+${buyerOwnerId.slice(0, 8)}@example.com`;
  await ensureOwnerDb(supabase, buyerOwnerId);
  const { error: buyerOwnerError } = await supabase
    .from("owners")
    .update({ email: buyerEmail, updated_at: new Date().toISOString() })
    .eq("owner_id", buyerOwnerId);
  if (buyerOwnerError) throw buyerOwnerError;
  await setupPolicyForOwner(request, buyerOwnerId, {
    budgets: { max_offer: 2000, currency: "EUR" },
    approval_thresholds: { offer_amount_gt: 2000, contact_reveal: "always" }
  });
  const buyer = await createAgentDbWithOverrides(supabase, buyerOwnerId, {
    createdAt: agedCreatedAt
  });
  const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyer.id);

  const missionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: mission, error: missionError } = await supabase
    .from("watchlists")
    .insert({
      agent_id: buyer.id,
      name: `Editable mission ${randomId()}`,
      active: true,
      market_code: "FR",
      currency: "EUR",
      criteria: {
        query: "used e-bike",
        mission: {
          version: 1,
          kind: "BUY",
          preferred_price_max: 1200,
          hard_budget_max: 1300,
          currency: "EUR",
          requirements: ["battery_health >= 80%"],
          autonomous_actions: ["search", "ask_question", "make_offer"],
          contact_reveal: "manual_bilateral_approval",
          expires_at: missionExpiresAt,
          location: { label: "Paris", lat: 48.8566, lon: 2.3522, radius_km: 25 }
        }
      },
      query_text: "used e-bike",
      tags: ["mobility", "e-bike"],
      price_max: 1300,
      geo_lat: 48.8566,
      geo_lon: 2.3522,
      distance_km: 25
    })
    .select("watchlist_id")
    .single();
  if (missionError) throw missionError;

  const listingRes = await createListing(request, sellerApiKey, {
    title: `Mission approval e-bike ${randomId()}`,
    price: { amount: 1400, currency: "EUR" },
    publish: true
  });
  await expectStatus(listingRes, 201);
  const listingId = (await listingRes.json()).listing_id as string;
  const offerExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const initialRes = await createOffer(
    request,
    buyerApiKey,
    listingId,
    {
      missionId: mission.watchlist_id,
      amount: 1200,
      currency: "EUR",
      expiresAt: offerExpiresAt
    },
    { idempotencyKey: randomId() }
  );
  await expectStatus(initialRes, 201);
  const initial = await initialRes.json();

  const sellerCounterRes = await createCounterOffer(
    request,
    sellerApiKey,
    initial.offer_id,
    { amount: 1350, currency: "EUR", expiresAt: offerExpiresAt },
    { idempotencyKey: randomId() }
  );
  await expectStatus(sellerCounterRes, 201);
  const sellerCounter = await sellerCounterRes.json();

  const blockedAccept = await acceptOffer(request, buyerApiKey, sellerCounter.offer_id, {
    missionId: mission.watchlist_id,
    idempotencyKey: randomId()
  });
  await expectStatus(blockedAccept, 409);
  const blockedBody = await blockedAccept.json();
  expect(blockedBody.error).toMatchObject({
    code: "APPROVAL_REQUIRED",
    details: { reason: "hard_budget_exceeded" }
  });
  const approvalId = blockedBody.error.details?.approval_id as string;
  expect(approvalId).toBeTruthy();

  const agentAttempt = await request.post(`/api/v1/approvals/${approvalId}:approve`, {
    headers: {
      Authorization: `Bearer ${buyerApiKey}`,
      Origin: origin,
      "Idempotency-Key": randomId()
    },
    data: { amount: 1290 }
  });
  await expectStatus(agentAttempt, 403);
  expect((await agentAttempt.json()).error.code).toBe("HUMAN_APPROVAL_REQUIRED");

  const foreignContext = await playwrightRequest.newContext({ baseURL });
  try {
    const foreignEmail = `itest+foreign-owner+${randomId().slice(0, 8)}@example.com`;
    await loginOwner(foreignContext, foreignEmail);
    const foreignAttempt = await foreignContext.post(
      `/api/v1/approvals/${approvalId}:approve`,
      {
        headers: { Origin: origin, "Idempotency-Key": randomId() },
        data: { amount: 1290 }
      }
    );
    await expectStatus(foreignAttempt, 404);
  } finally {
    await foreignContext.dispose();
  }

  expect(await loginOwner(request, buyerEmail)).toBe(buyerOwnerId);
  const noOrigin = await request.post(`/api/v1/approvals/${approvalId}:approve`, {
    headers: { "Idempotency-Key": randomId() },
    data: { amount: 1290 }
  });
  await expectStatus(noOrigin, 403);
  expect((await noOrigin.json()).error.code).toBe("CSRF_BLOCKED");

  const foreignOrigin = await request.post(`/api/v1/approvals/${approvalId}:approve`, {
    headers: { Origin: "https://evil.example", "Idempotency-Key": randomId() },
    data: { amount: 1290 }
  });
  await expectStatus(foreignOrigin, 403);
  expect((await foreignOrigin.json()).error.code).toBe("CSRF_BLOCKED");

  const approve = await request.post(`/api/v1/approvals/${approvalId}:approve`, {
    headers: { Origin: origin, "Idempotency-Key": randomId() },
    data: { amount: 1290, note: "Approved after owner review" }
  });
  await expectStatus(approve, 200);
  expect((await approve.json()).data.state).toBe("APPROVED");

  const { data: resolvedApproval, error: approvalError } = await supabase
    .from("approvals")
    .select("state,resolved_by_human_id,resolved_reason_text,action_ref,action_payload_redacted")
    .eq("approval_id", approvalId)
    .single();
  if (approvalError) throw approvalError;
  expect(resolvedApproval).toMatchObject({
    state: "APPROVED",
    resolved_by_human_id: buyerOwnerId,
    resolved_reason_text: "Approved after owner review",
    action_ref: { amount: 1290, mission_id: mission.watchlist_id },
    action_payload_redacted: {
      offer: { amount: 1290 },
      owner_edit: { amount: 1290 }
    }
  });

  const { data: counters, error: countersError } = await supabase
    .from("offers")
    .select("offer_id,previous_offer_id,amount,currency,status,buy_mission_id")
    .eq("previous_offer_id", sellerCounter.offer_id);
  if (countersError) throw countersError;
  expect(counters).toHaveLength(1);
  expect(counters?.[0]).toMatchObject({
    previous_offer_id: sellerCounter.offer_id,
    amount: 1290,
    currency: "EUR",
    status: "CREATED",
    buy_mission_id: mission.watchlist_id
  });

  const replay = await request.post(`/api/v1/approvals/${approvalId}:approve`, {
    headers: { Origin: origin, "Idempotency-Key": randomId() },
    data: { amount: 1290 }
  });
  await expectStatus(replay, 200);
  const { count, error: countError } = await supabase
    .from("offers")
    .select("offer_id", { count: "exact", head: true })
    .eq("previous_offer_id", sellerCounter.offer_id);
  if (countError) throw countError;
  expect(count).toBe(1);
});
