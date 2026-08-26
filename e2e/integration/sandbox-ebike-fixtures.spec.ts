import { expect, test } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus } from "./helpers/http";
import {
  createActiveApiKeyDb,
  createAgentDbWithOverrides,
  createSupabaseAdmin,
  ensureOwnerDb
} from "./helpers/supabase";

assertIntegrationEnv();

test("sandbox reset seeds a distinct, deterministic e-bike seller and buyer mission", async ({
  request
}) => {
  const supabase = createSupabaseAdmin();
  const buyerOwnerId = randomId();
  await ensureOwnerDb(supabase, buyerOwnerId);
  const buyer = await createAgentDbWithOverrides(supabase, buyerOwnerId, {
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    trustScore: 70,
    trustFlags: []
  });
  const { apiKey } = await createActiveApiKeyDb(supabase, buyer.id);

  const reset = async () => {
    const response = await request.post("/api/v1/sandbox/reset", {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: {}
    });
    await expectStatus(response, 200);
    return response.json();
  };

  const first = await reset();
  expect(first.ok).toBe(true);
  expect(first.counts).toMatchObject({ deals: 3, listings: 7, watchlists: 3 });
  expect(first.actors.buyer_agent_id).toBe(buyer.id);
  expect(first.actors.seller_agent_id).not.toBe(buyer.id);

  const { data: eBikes, error: eBikeError } = await supabase
    .from("listings")
    .select("listing_id,seller_agent_id,owner_id,title,price_amount,currency,duplicate_fingerprint")
    .eq("seller_agent_id", first.actors.seller_agent_id)
    .like("duplicate_fingerprint", "sandbox-ebike-%")
    .order("duplicate_fingerprint", { ascending: true });
  if (eBikeError) throw eBikeError;
  expect(eBikes).toHaveLength(5);
  expect(eBikes.every((listing: any) => listing.seller_agent_id !== buyer.id)).toBe(true);
  expect(eBikes.every((listing: any) => listing.owner_id === first.actors.seller_owner_id)).toBe(
    true
  );

  const { data: mission, error: missionError } = await supabase
    .from("watchlists")
    .select("agent_id,active,currency,criteria")
    .eq("agent_id", buyer.id)
    .eq("name", "Paris used e-bike mission")
    .single();
  if (missionError) throw missionError;
  expect(mission.agent_id).toBe(buyer.id);
  expect(mission.criteria.mission).toMatchObject({
    kind: "BUY",
    preferred_price_max: 1200,
    hard_budget_max: 1300,
    currency: "EUR",
    requirements: ["battery_health >= 80%"],
    autonomous_actions: ["search", "ask_question", "make_offer"]
  });

  const { data: sellerPolicy, error: sellerPolicyError } = await supabase
    .from("policies")
    .select("policy_json")
    .eq("owner_id", first.actors.seller_owner_id)
    .single();
  if (sellerPolicyError) throw sellerPolicyError;
  expect(sellerPolicy.policy_json).toMatchObject({
    budgets: { max_offer: 1500, currency: "EUR" },
    auto_approve: {
      message_types: ["question", "answer", "info"],
      actions: ["thread.create", "offer.accept"]
    }
  });

  const second = await reset();
  expect(second.actors).toEqual(first.actors);

  const { count: sellerCount, error: sellerCountError } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .contains("metadata", { system: "sandbox.ebike-seller", env: "sandbox" });
  if (sellerCountError) throw sellerCountError;
  expect(sellerCount).toBe(1);

  const { count: eBikeCount, error: eBikeCountError } = await supabase
    .from("listings")
    .select("listing_id", { count: "exact", head: true })
    .eq("seller_agent_id", first.actors.seller_agent_id)
    .like("duplicate_fingerprint", "sandbox-ebike-%");
  if (eBikeCountError) throw eBikeCountError;
  expect(eBikeCount).toBe(5);
});
