import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRequire } from "node:module";
import { assertIntegrationEnv } from "./helpers/env";
import { createSupabaseAdmin, createAgentDbWithOverrides, createActiveApiKeyDb } from "./helpers/supabase";
import { randomId } from "./helpers/ids";

assertIntegrationEnv();

test("SDK seller/buyer writes persist and MCP reads both match types", async ({ baseURL }, testInfo) => {
  test.setTimeout(180_000);
  // Load the built SDK only when this journey runs. App builds and test discovery
  // must also work in fresh checkouts without ignored generated SDK sources.
  const { createClient } = createRequire(`${process.cwd()}/package.json`)("./sdk/typescript/dist/src/client.js");
  const db = createSupabaseAdmin();
  const ownerIds = [randomId(), randomId()];
  const agentIds: string[] = [];
  const keyIds: string[] = [];
  const keys: string[] = [];
  const apiBase = `${baseURL}/api`;
  try {
    const cronUrl = `${baseURL}/api/internal/cron/partition-maintenance`;
    expect((await fetch(cronUrl, { method: "POST" })).status).toBe(401);
    const maintenance = await fetch(cronUrl, { method: "POST", headers: { "x-cron-secret": process.env.INTERNAL_CRON_SECRET! } });
    expect(maintenance.status).toBe(200);
    expect((await maintenance.json()).partitions).toHaveLength(3);
    for (const ownerId of ownerIds) {
      const owner = await db.from("owners").insert({ owner_id: ownerId });
      if (owner.error) throw new Error(owner.error.message);
      const agent = await createAgentDbWithOverrides(db, ownerId, {
        name: `SDK verification ${ownerId}`, createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
        trustScore: 90, trustFlags: []
      });
      agentIds.push(agent.id);
      const key = await createActiveApiKeyDb(db, agent.id);
      keys.push(key.apiKey); keyIds.push(key.apiKeyId);
      const policy = await db.from("policies").insert({ owner_id: ownerId, version: 1, policy_json: {
        version: 1, budgets: { max_offer: 100000, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 100000, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create", "thread.create"] },
        allowlist_agent_ids: [], denylist_agent_ids: []
      } });
      if (policy.error) throw new Error(policy.error.message);
    }
    const seller = createClient({ baseUrl: apiBase, apiKey: keys[0] });
    const buyer = createClient({ baseUrl: apiBase, apiKey: keys[1] });
    expect(createClient().configuration.basePath).toBe("https://app.clawdeals.com/api");
    const listing = { title: `SDK E2E ${ownerIds[0]}`, description: "Disposable SDK fixture", category: "hardware", condition: "GOOD" as const, price: { amount: 25000, currency: "EUR" }, market_code: "FR" as const, publish: true };
    const offer = { amount: 23000, currency: "EUR", expires_at: new Date(Date.now() + 3600000) };
    await expect(seller.createListingAndOffer(listing, offer, { buyer: seller })).rejects.toThrow(/separately authenticated/);
    const before = await db.from("listings").select("listing_id").eq("seller_agent_id", agentIds[0]);
    expect(before.error).toBeNull(); expect(before.data).toHaveLength(0);
    const ids = { listingIdempotencyKey: randomId(), offerIdempotencyKey: randomId() };
    const result = await seller.createListingAndOffer(listing, offer, { buyer, ...ids });
    const replay = await seller.createListingAndOffer(listing, offer, { buyer, ...ids });
    expect(replay.listing.listing_id).toBe(result.listing.listing_id);
    expect(replay.offer.offer_id).toBe(result.offer.offer_id);
    const persisted = await db.from("offers").select("buyer_agent_id,seller_agent_id,amount").eq("offer_id", result.offer.offer_id).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toMatchObject({ buyer_agent_id: agentIds[1], seller_agent_id: agentIds[0], amount: 23000 });

    const watchlist = await buyer.createWatchlist({ name: "SDK MCP fixture", active: true, criteria: { query: "SDK", tags: [], price_max: 500 } });
    const watchlistId = (watchlist as any).watchlist_id;
    expect(watchlistId).toBeTruthy();
    const transport = new StdioClientTransport({ command: process.execPath, args: ["scripts/mcp-server.mjs"], env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string] => typeof entry[1] === "string")),
      CLAWDEALS_API_BASE: apiBase, CLAWDEALS_API_KEY: keys[1]
    }, stderr: "pipe" });
    const mcp = new Client({ name: "clawdeals-e2e", version: "1" });
    try {
      await mcp.connect(transport);
      for (const entity_type of ["deal", "listing"]) {
        const r = await mcp.callTool({ name: "clawdeals.watchlists.get_matches", arguments: { watchlist_id: watchlistId, entity_type } });
        expect(r.isError, JSON.stringify(r.structuredContent)).not.toBe(true);
      }
      const invalid = await mcp.callTool({ name: "clawdeals.watchlists.get_matches", arguments: { watchlist_id: watchlistId, entity_type: "invalid" } });
      expect(invalid.isError).toBe(true);
    } finally { await mcp.close(); }

    const python = process.env.CLAWDEALS_TEST_PYTHON;
    expect(python, "Set CLAWDEALS_TEST_PYTHON to a Python with sdk/python and its generated package installed").toBeTruthy();
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(python!, ["e2e/integration/sdk-python-journey.py"], { env: {
        ...process.env, CLAWDEALS_API_BASE: apiBase, CLAWDEALS_SELLER_API_KEY: keys[0], CLAWDEALS_BUYER_API_KEY: keys[1], CLAWDEALS_FIXTURE_ID: ownerIds[0]
      } });
      let out = ""; let err = "";
      child.stdout.on("data", b => out += b); child.stderr.on("data", b => err += b);
      child.on("error", reject); child.on("close", code => code === 0 ? resolve(out) : reject(new Error(`Python SDK journey failed (${code}): ${err}`)));
    });
    const pyResult = JSON.parse(output);
    const pyOffer = await db.from("offers").select("buyer_agent_id,seller_agent_id").eq("offer_id", pyResult.offer_id).single();
    expect(pyOffer.error).toBeNull();
    expect(pyOffer.data).toMatchObject({ buyer_agent_id: agentIds[1], seller_agent_id: agentIds[0] });
    await expect.poll(async () => {
      const audit = await db.from("audit_logs").select("id").eq("actor->>id", agentIds[0]).gte("occurred_at", new Date(Date.now() - 300000).toISOString());
      if (audit.error) throw new Error(audit.error.message);
      return audit.data?.length || 0;
    }, { timeout: 15000 }).toBeGreaterThan(0);
    await testInfo.attach("verified-records", { body: JSON.stringify({ listing_id: result.listing.listing_id, offer_id: result.offer.offer_id, python: pyResult }), contentType: "application/json" });
  } finally {
    // Retire only this run's fixtures; never bulk-reset the shared database.
    if (keyIds.length) {
      const r = await db.from("api_keys").update({ key_state: "REVOKED" }).in("api_key_id", keyIds);
      if (r.error) throw new Error(`Fixture key revocation failed: ${r.error.message}`);
    }
    if (agentIds.length) {
      const watches = await db.from("watchlists").update({ active: false }).in("agent_id", agentIds);
      if (watches.error) throw new Error(`Fixture watchlist retirement failed: ${watches.error.message}`);
      const r = await db.from("listings").update({ status: "REMOVED" }).in("seller_agent_id", agentIds);
      if (r.error) throw new Error(`Fixture listing retirement failed: ${r.error.message}`);
    }
  }
});
