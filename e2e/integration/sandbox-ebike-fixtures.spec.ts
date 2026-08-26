import { expect, test } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { expectStatus } from "./helpers/http";
import {
  createActiveApiKeyDb,
  createSupabaseAdmin,
  ensureOwnerDb
} from "./helpers/supabase";

assertIntegrationEnv();

const JUDGE_AGENT_ID = "93000000-0000-4000-8000-000000000001";
const JUDGE_OWNER_ID = "94000000-0000-4000-8000-000000000001";

test("sandbox reset seeds a distinct, deterministic e-bike seller and buyer mission", async ({
  request
}) => {
  const supabase = createSupabaseAdmin();
  await ensureOwnerDb(supabase, JUDGE_OWNER_ID);
  const { data: buyer, error: buyerError } = await supabase
    .from("agents")
    .upsert({
      id: JUDGE_AGENT_ID,
      owner_id: JUDGE_OWNER_ID,
      name: "WebMCP Judge Agent",
      created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      trust_score: 70,
      trust_flags: []
    })
    .select()
    .single();
  if (buyerError) throw buyerError;
  const { error: oldKeysError } = await supabase
    .from("api_keys")
    .delete()
    .eq("agent_id", JUDGE_AGENT_ID);
  if (oldKeysError) throw oldKeysError;
  const { apiKey } = await createActiveApiKeyDb(supabase, JUDGE_AGENT_ID);

  const reset = async () => {
    const response = await request.post("/api/v1/sandbox/reset", {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { mode: "webmcp_challenge" }
    });
    await expectStatus(response, 200);
    return response.json();
  };

  const first = await reset();
  expect(first.ok).toBe(true);
  expect(first.counts).toMatchObject({
    deals: 3,
    listings: 7,
    watchlists: 3,
    threads: 1,
    messages: 1
  });
  expect(first.actors.buyer_agent_id).toBe(buyer.id);
  expect(first.actors.seller_agent_id).not.toBe(buyer.id);

  const { data: eBikes, error: eBikeError } = await supabase
    .from("listings")
    .select("listing_id,seller_agent_id,owner_id,title,price_amount,currency,duplicate_fingerprint")
    .eq("seller_agent_id", first.actors.seller_agent_id)
    .like("duplicate_fingerprint", "sandbox-webmcp-judge-ebike-%")
    .order("duplicate_fingerprint", { ascending: true });
  if (eBikeError) throw eBikeError;
  expect(eBikes).toHaveLength(5);
  expect(eBikes.map((listing: any) => listing.listing_id).sort()).toEqual([
    "90000000-0000-4000-8000-000000000001",
    "90000000-0000-4000-8000-000000000002",
    "90000000-0000-4000-8000-000000000003",
    "90000000-0000-4000-8000-000000000004",
    "90000000-0000-4000-8000-000000000005"
  ]);
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
  expect(second.thread.thread_id).toBe(first.thread.thread_id);
  expect(second.thread.listing_id).toBe(first.thread.listing_id);
  expect(second.thread.thread_id).toBe("91000000-0000-4000-8000-000000000001");

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
    .like("duplicate_fingerprint", "sandbox-webmcp-judge-ebike-%");
  if (eBikeCountError) throw eBikeCountError;
  expect(eBikeCount).toBe(5);

  const { data: judgeThreads, error: judgeThreadError } = await supabase
    .from("threads")
    .select("thread_id,listing_id,buyer_agent_id,seller_agent_id,status")
    .eq("thread_id", "91000000-0000-4000-8000-000000000001");
  if (judgeThreadError) throw judgeThreadError;
  expect(judgeThreads).toEqual([
    expect.objectContaining({
      thread_id: "91000000-0000-4000-8000-000000000001",
      listing_id: "90000000-0000-4000-8000-000000000001",
      buyer_agent_id: buyer.id,
      seller_agent_id: first.actors.seller_agent_id,
      status: "OPEN"
    })
  ]);

  const { data: judgeMessages, error: judgeMessageError } = await supabase
    .from("messages")
    .select("message_id,thread_id,sender_type,body,redacted")
    .eq("thread_id", "91000000-0000-4000-8000-000000000001");
  if (judgeMessageError) throw judgeMessageError;
  expect(judgeMessages).toEqual([
    expect.objectContaining({
      message_id: "92000000-0000-4000-8000-000000000001",
      sender_type: "system",
      redacted: false
    })
  ]);
  expect(JSON.stringify(judgeMessages)).not.toMatch(/@|\+33|phone/i);
});
