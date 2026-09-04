import { expect, test, type APIRequestContext } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { acceptOffer, createOffer, expectStatus } from "./helpers/http";
import { createActiveApiKeyDb, createSupabaseAdmin, ensureOwnerDb } from "./helpers/supabase";

assertIntegrationEnv();

const JUDGE_AGENT_ID = "93000000-0000-4000-8000-000000000001";
const JUDGE_OWNER_ID = "94000000-0000-4000-8000-000000000001";
const LISTING_ID = "90000000-0000-4000-8000-000000000001";

async function prepare(request: APIRequestContext, amount: number) {
  const db = createSupabaseAdmin();
  await ensureOwnerDb(db, JUDGE_OWNER_ID);
  const { error } = await db.from("agents").upsert({
    id: JUDGE_AGENT_ID,
    owner_id: JUDGE_OWNER_ID,
    name: "WebMCP autopilot integration judge",
    created_at: new Date(Date.now() - 10 * 86400_000).toISOString(),
    trust_score: 70,
    trust_flags: []
  });
  if (error) throw error;
  const { error: keyError } = await db.from("api_keys").delete().eq("agent_id", JUDGE_AGENT_ID);
  if (keyError) throw keyError;
  const { apiKey } = await createActiveApiKeyDb(db, JUDGE_AGENT_ID);
  const headers = { Authorization: `Bearer ${apiKey}` };
  const { data: previousPolicy, error: policyReadError } = await db.from("policies")
    .select("policy_json").eq("owner_id", JUDGE_OWNER_ID).maybeSingle();
  if (policyReadError) throw policyReadError;
  const policy = { budgets: { max_offer: 1300, currency: "EUR" }, auto_approve: {
    actions: ["thread.create", "offer.accept"], message_types: ["question", "answer", "info"]
  } };
  const policyWrite = previousPolicy
    ? db.from("policies").update({ policy_json: policy }).eq("owner_id", JUDGE_OWNER_ID)
    : db.from("policies").insert({ owner_id: JUDGE_OWNER_ID, policy_json: policy });
  const { error: policyWriteError } = await policyWrite;
  if (policyWriteError) throw policyWriteError;
  const reset = () => request.post("/api/v1/sandbox/reset", {
    headers, data: { mode: "webmcp_challenge" }
  });
  await expectStatus(await reset(), 200);
  const { data: mission, error: missionError } = await db.from("watchlists")
    .select("watchlist_id")
    .eq("agent_id", JUDGE_AGENT_ID)
    .eq("name", "Paris used e-bike mission")
    .single();
  if (missionError) throw missionError;
  const offer = await createOffer(request, apiKey, LISTING_ID, {
    missionId: mission.watchlist_id,
    amount,
    currency: "EUR",
    expiresAt: new Date(Date.now() + 3600_000).toISOString()
  });
  await expectStatus(offer, 201);
  return {
    db, apiKey,
    reset: async () => {
      const response = await reset();
      const restore = previousPolicy
        ? db.from("policies").update({ policy_json: previousPolicy.policy_json }).eq("owner_id", JUDGE_OWNER_ID)
        : db.from("policies").delete().eq("owner_id", JUDGE_OWNER_ID);
      const { error: restoreError } = await restore;
      if (restoreError) throw restoreError;
      return response;
    },
    turn: () => request.post("/api/v1/sandbox/seller-turn", { headers, data: {} })
  };
}

test("seller counter is persistent, repeatable and blocked by the buyer hard budget", async ({ request }) => {
  const { db, apiKey, turn, reset } = await prepare(request, 1100);
  try {
    const response = await turn();
    await expectStatus(response, 200);
    const first = await response.json();
    expect(first).toMatchObject({ action: "counter", idempotent: false, offer: { amount: 1350, status: "CREATED" } });
    const replay = await turn();
    await expectStatus(replay, 200);
    expect(await replay.json()).toMatchObject({
      action: "counter", idempotent: true, offer: { offer_id: first.offer.offer_id }
    });
    const blocked = await acceptOffer(request, apiKey, first.offer.offer_id);
    await expectStatus(blocked, 409);
    expect(await blocked.json()).toMatchObject({ error: { code: "APPROVAL_REQUIRED", details: { reason: "hard_budget_exceeded" } } });
    const { data: listing, error } = await db.from("listings").select("status").eq("listing_id", LISTING_ID).single();
    if (error) throw error;
    expect(listing.status).toBe("LIVE");
  } finally {
    await expectStatus(await reset(), 200);
  }
});

test("overlapping seller turns cannot create two open counters", async ({ request }) => {
  const { db, turn, reset } = await prepare(request, 1100);
  try {
    const responses = await Promise.all([turn(), turn()]);
    expect(responses.some((response) => response.status() === 200)).toBe(true);
    for (const response of responses) expect([200, 409]).toContain(response.status());
    const { data: counters, error } = await db.from("offers")
      .select("offer_id,amount")
      .eq("buyer_agent_id", JUDGE_AGENT_ID)
      .eq("listing_id", LISTING_ID)
      .eq("status", "CREATED");
    if (error) throw error;
    expect(counters).toHaveLength(1);
    expect(counters[0].amount).toBe(1350);
    const replay = await turn();
    await expectStatus(replay, 200);
    expect(await replay.json()).toMatchObject({ idempotent: true, offer: { offer_id: counters[0].offer_id } });
  } finally {
    await expectStatus(await reset(), 200);
  }
});

test("seller floor acceptance reserves once and exposes the persisted transaction", async ({ request }) => {
  const { db, turn, reset } = await prepare(request, 1250);
  try {
    const response = await turn();
    await expectStatus(response, 200);
    const accepted = await response.json();
    expect(accepted).toMatchObject({ action: "accept", listing_status: "RESERVED", offer: { status: "ACCEPTED" } });
    expect(accepted.transaction.tx_id).toEqual(expect.any(String));
    const { data: transaction, error } = await db.from("transactions")
      .select("tx_id,accepted_offer_id")
      .eq("tx_id", accepted.transaction.tx_id).single();
    if (error) throw error;
    expect(transaction.accepted_offer_id).toBe(accepted.offer.offer_id);
    const replay = await turn();
    await expectStatus(replay, 200);
    expect(await replay.json()).toMatchObject({ action: "noop", idempotent: true, offer: { offer_id: accepted.offer.offer_id } });
    const { count, error: countError } = await db.from("transactions")
      .select("tx_id", { count: "exact", head: true }).eq("accepted_offer_id", accepted.offer.offer_id);
    if (countError) throw countError;
    expect(count).toBe(1);
  } finally {
    await expectStatus(await reset(), 200);
  }
});
