import { test, expect } from "@playwright/test";

import { assertIntegrationEnv, skipRateLimitTests } from "./helpers/env";
import { randomId, sha256Hex } from "./helpers/ids";
import { waitForAuditLog } from "./helpers/audit";
import { expectStatus } from "./helpers/http";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDb, createActiveApiKeyDb, setupAgent } from "./helpers/supabase";

import { calculateDealTemperature } from "../../src/server/utils/deals";
import { runDealLifecycle } from "../../src/server/services/deal-lifecycle";

assertIntegrationEnv();

test.describe.serial("Integration: Deals API", () => {
  test.setTimeout(60000);

  test("create deal idempotency + audit", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const auditSince = new Date().toISOString();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const payload = {
      title: "Integration Deal",
      url: `https://example.com/p/${randomId()}?utm_source=twitter&b=2&a=1#frag`,
      price: 129.99,
      currency: "EUR",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      tags: ["gpu", "nvidia"]
    };

    const idemKey = randomId();
    const auditRequestId = randomId();
    const first = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": idemKey, "x-request-id": auditRequestId },
      data: payload
    });
    await expectStatus(first, 201);
    const firstBody = await first.json();
    expect(firstBody.deal.deal_id).toBeTruthy();

    const second = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": idemKey },
      data: payload
    });
    await expectStatus(second, 201);
    expect(second.headers()["idempotency-replayed"]).toBe("true");
    const secondBody = await second.json();
    expect(secondBody.deal.deal_id).toBe(firstBody.deal.deal_id);

    const { data: persisted, error } = await supabase
      .from("deals")
      .select("source_url_normalized, source_url_fingerprint")
      .eq("deal_id", firstBody.deal.deal_id)
      .single();
    expect(error).toBeNull();
    expect(persisted?.source_url_normalized).toBeTruthy();
    expect(persisted?.source_url_fingerprint).toMatch(/^[0-9a-f]{64}$/i);

    const audit = await waitForAuditLog(supabase, "deal.create", 10, auditSince, auditRequestId);
    expect(audit).not.toBeNull();
    expect(audit.outcome).toBe("SUCCESS");
  });

  test("duplicate detection returns existing deal (200 + meta.duplicate)", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const dealSlug = randomId();
    const urlA = `https://example.com/p/${dealSlug}?utm_source=x&b=2&a=1#frag`;
    const urlB = `https://example.com/p/${dealSlug}?utm_source=y&utm_campaign=z&a=1&b=2#other`;

    const payload = {
      title: "Integration Duplicate Deal",
      url: urlA,
      price: 129.99,
      currency: "EUR",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      tags: ["duplicate", "ti-255"]
    };

    const create = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: payload
    });
    await expectStatus(create, 201);
    const createdBody = await create.json();
    const createdDealId = createdBody?.deal?.deal_id;
    expect(createdDealId).toBeTruthy();

    const { data: persisted, error: persistedError } = await supabase
      .from("deals")
      .select("source_url_fingerprint")
      .eq("deal_id", createdDealId)
      .single();
    expect(persistedError).toBeNull();
    const fingerprint = persisted?.source_url_fingerprint;
    expect(fingerprint).toBeTruthy();

    const dup = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: { ...payload, url: urlB }
    });
    await expectStatus(dup, 200);
    const dupBody = await dup.json();
    expect(dupBody?.meta?.duplicate).toBe(true);
    expect(dupBody?.meta?.existing_deal_id).toBe(createdDealId);
    expect(dupBody?.deal?.deal_id).toBe(createdDealId);

    // Ensure we didn't create a second row for the same fingerprint.
    const { data: sameFingerprint, error: sameFingerprintError } = await supabase
      .from("deals")
      .select("deal_id")
      .eq("source_url_fingerprint", fingerprint);
    expect(sameFingerprintError).toBeNull();
    expect((sameFingerprint || []).length).toBe(1);
  });

  test("deal lifecycle transitions NEW to ACTIVE and ACTIVE to EXPIRED", async () => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);

    const now = new Date();
    const nowIso = now.toISOString();
    const pastIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const createdAtIso = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const futureIso = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    const urlA = `https://example.com/deal/${randomId()}`;
    const urlB = `https://example.com/deal/${randomId()}`;

    const { data: inserted, error } = await supabase
      .from("deals")
      .insert([
        {
          title: "Lifecycle NEW",
          source_url: urlA,
          source_url_normalized: urlA,
          source_url_fingerprint: sha256Hex(urlA),
          price: 10,
          currency: "EUR",
          created_at: createdAtIso,
          expires_at: futureIso,
          tags: ["lifecycle"],
          status: "NEW",
          new_until: pastIso,
          creator_agent_id: agent.id
        },
        {
          title: "Lifecycle ACTIVE",
          source_url: urlB,
          source_url_normalized: urlB,
          source_url_fingerprint: sha256Hex(urlB),
          price: 20,
          currency: "EUR",
          created_at: createdAtIso,
          expires_at: pastIso,
          tags: ["lifecycle"],
          status: "ACTIVE",
          new_until: pastIso,
          active_at: pastIso,
          creator_agent_id: agent.id
        }
      ])
      .select("deal_id");

    expect(error).toBeNull();
    const [dealA, dealB] = inserted.map((row: any) => row.deal_id);

    await runDealLifecycle({ now });

    const { data: updatedA, error: fetchAError } = await supabase
      .from("deals")
      .select("status, active_at, expired_at")
      .eq("deal_id", dealA)
      .single();
    expect(fetchAError).toBeNull();
    expect(updatedA.status).toBe("ACTIVE");
    expect(updatedA.active_at).toBeTruthy();

    const { data: updatedB, error: fetchBError } = await supabase
      .from("deals")
      .select("status, active_at, expired_at")
      .eq("deal_id", dealB)
      .single();
    expect(fetchBError).toBeNull();
    expect(updatedB.status).toBe("EXPIRED");
    expect(updatedB.expired_at).toBeTruthy();

    const { data: audits, error: auditError } = await supabase
      .from("audit_logs")
      .select("payload")
      .eq("action->>event", "deal.state_changed")
      .gte("occurred_at", nowIso);
    expect(auditError).toBeNull();
    const changedIds = new Set((audits || []).map((row: any) => row.payload?.deal_id));
    expect(changedIds.has(dealA)).toBe(true);
    expect(changedIds.has(dealB)).toBe(true);
  });

  test("deal feed sorting + pagination + audit (new/temp/trend)", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { agent, apiKey } = await setupAgent(supabase);

    const runTag = `itest${randomId().split("-")[0]}`;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const newDealCreatedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const newUntil = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

    const activeHotCreatedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const activeHotAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    const activeCoolCreatedAt = new Date(now.getTime() - 110 * 60 * 1000).toISOString();
    const activeCoolAt = new Date(now.getTime() - 70 * 60 * 1000).toISOString();

    const activeRecentCreatedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const activeRecentAt = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

    const urlNew = `https://example.com/feed/${randomId()}`;
    const urlHot = `https://example.com/feed/${randomId()}`;
    const urlCool = `https://example.com/feed/${randomId()}`;
    const urlRecent = `https://example.com/feed/${randomId()}`;

    const { data: inserted, error } = await supabase
      .from("deals")
      .insert([
        {
          title: "Feed NEW",
          source_url: urlNew,
          source_url_normalized: urlNew,
          source_url_fingerprint: sha256Hex(urlNew),
          price: 10,
          currency: "EUR",
          created_at: newDealCreatedAt,
          expires_at: expiresAt,
          tags: [runTag, "feed"],
          status: "NEW",
          new_until: newUntil,
          temperature: 99,
          creator_agent_id: agent.id
        },
        {
          title: "Feed ACTIVE hot",
          source_url: urlHot,
          source_url_normalized: urlHot,
          source_url_fingerprint: sha256Hex(urlHot),
          price: 20,
          currency: "EUR",
          created_at: activeHotCreatedAt,
          expires_at: expiresAt,
          tags: [runTag, "feed"],
          status: "ACTIVE",
          new_until: newUntil,
          active_at: activeHotAt,
          temperature: 90,
          creator_agent_id: agent.id
        },
        {
          title: "Feed ACTIVE cool",
          source_url: urlCool,
          source_url_normalized: urlCool,
          source_url_fingerprint: sha256Hex(urlCool),
          price: 30,
          currency: "EUR",
          created_at: activeCoolCreatedAt,
          expires_at: expiresAt,
          tags: [runTag, "feed"],
          status: "ACTIVE",
          new_until: newUntil,
          active_at: activeCoolAt,
          temperature: 70,
          creator_agent_id: agent.id
        },
        {
          title: "Feed ACTIVE recent",
          source_url: urlRecent,
          source_url_normalized: urlRecent,
          source_url_fingerprint: sha256Hex(urlRecent),
          price: 40,
          currency: "EUR",
          created_at: activeRecentCreatedAt,
          expires_at: expiresAt,
          tags: [runTag, "feed"],
          status: "ACTIVE",
          new_until: newUntil,
          active_at: activeRecentAt,
          temperature: 90,
          creator_agent_id: agent.id
        }
      ])
      .select("deal_id, title");

    expect(error).toBeNull();
    const idsByTitle = new Map((inserted || []).map((row: any) => [row.title, row.deal_id]));
    const newId = idsByTitle.get("Feed NEW");
    const hotId = idsByTitle.get("Feed ACTIVE hot");
    const coolId = idsByTitle.get("Feed ACTIVE cool");
    const recentId = idsByTitle.get("Feed ACTIVE recent");
    expect(newId).toBeTruthy();
    expect(hotId).toBeTruthy();
    expect(coolId).toBeTruthy();
    expect(recentId).toBeTruthy();

    const auditSince = new Date().toISOString();
    const auditRequestId = randomId();

    const newRes = await request.get(`/api/v1/deals?sort=new&tags=${runTag}&limit=10`, {
      headers: { Authorization: `Bearer ${apiKey}`, "x-request-id": auditRequestId }
    });
    await expectStatus(newRes, 200);
    const newBody = await newRes.json();
    expect(newBody.items.map((item: any) => item.deal_id)).toEqual([newId, recentId, coolId, hotId]);
    expect(newBody.items[0].temperature).toBeNull();

    const tempRes = await request.get(`/api/v1/deals?sort=temp&status=ACTIVE&tags=${runTag}&limit=10`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(tempRes, 200);
    const tempBody = await tempRes.json();
    expect(tempBody.items.map((item: any) => item.deal_id)).toEqual([recentId, hotId, coolId]);

    const trendPage1 = await request.get(`/api/v1/deals?sort=trend&status=ACTIVE&tags=${runTag}&limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(trendPage1, 200);
    const trendBody1 = await trendPage1.json();
    expect(trendBody1.items).toHaveLength(1);
    expect(trendBody1.items[0].deal_id).toBe(recentId);
    expect(trendBody1.next_cursor).toBeTruthy();

    const trendPage2 = await request.get(
      `/api/v1/deals?sort=trend&status=ACTIVE&tags=${runTag}&limit=1&cursor=${encodeURIComponent(trendBody1.next_cursor)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` }
      }
    );
    await expectStatus(trendPage2, 200);
    const trendBody2 = await trendPage2.json();
    expect(trendBody2.items).toHaveLength(1);
    expect(trendBody2.items[0].deal_id).toBe(hotId);

    const audit = await waitForAuditLog(supabase, "deals.listed", 10, auditSince, auditRequestId);
    expect(audit).toBeTruthy();
    expect(audit.outcome).toBe("SUCCESS");
  });

  test("FTS q filter + price_max filter (TI-269)", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const tokenA = `ti269_${sha256Hex(randomId()).slice(0, 10)}`;
    const tokenB = `ti269_${sha256Hex(randomId()).slice(0, 10)}`;

    const aRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: `TI-269 ${tokenA}`,
        url: `https://example.com/ti-269/${randomId()}`,
        price: 99.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        tags: ["fts", tokenA]
      }
    });
    await expectStatus(aRes, 201);
    const aBody = await aRes.json();
    const dealA = aBody.deal?.deal_id;
    expect(dealA).toBeTruthy();

    const bRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: `TI-269 ${tokenB}`,
        url: `https://example.com/ti-269/${randomId()}`,
        price: 199.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        tags: ["fts", tokenB]
      }
    });
    await expectStatus(bRes, 201);

    const qRes = await request.get(`/api/v1/deals?sort=new&q=${encodeURIComponent(tokenA)}&limit=10`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(qRes, 200);
    const qBody = await qRes.json();
    const ids = (qBody.items || []).map((item: any) => item.deal_id);
    expect(ids).toEqual([dealA]);

    const maxTooLow = await request.get(
      `/api/v1/deals?sort=new&q=${encodeURIComponent(tokenA)}&price_max=50&limit=10`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    await expectStatus(maxTooLow, 200);
    const maxTooLowBody = await maxTooLow.json();
    expect((maxTooLowBody.items || []).length).toBe(0);

    const maxOk = await request.get(
      `/api/v1/deals?sort=new&q=${encodeURIComponent(tokenA)}&price_max=150&limit=10`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    await expectStatus(maxOk, 200);
    const maxOkBody = await maxOk.json();
    expect((maxOkBody.items || []).map((item: any) => item.deal_id)).toEqual([dealA]);
  });

  test("deal vote with reason + unique vote", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const createRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Vote Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 79.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        tags: ["vote"]
      }
    });
    await expectStatus(createRes, 201);
    const created = await createRes.json();
    const dealId = created.deal.deal_id;

    const voteKey = randomId();
    const auditSince = new Date().toISOString();
    const auditRequestId = randomId();
    const voteRes = await request.post(`/api/v1/deals/${dealId}/vote`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": voteKey, "x-request-id": auditRequestId },
      data: { direction: "up", reason: "Excellent price vs MSRP." }
    });
    await expectStatus(voteRes, 201);
    const voteBody = await voteRes.json();
    expect(voteBody.vote.deal_id).toBe(dealId);
    expect(voteBody.vote.agent_id).toBe(agent.id);
    expect(voteBody.deal.votes_up).toBe(1);
    expect(voteBody.deal.temperature).toBeNull();

    const { data: dealRow, error: dealError } = await supabase
      .from("deals")
      .select("votes_weighted_up, votes_weighted_down, temperature")
      .eq("deal_id", dealId)
      .single();
    expect(dealError).toBeNull();
    const weightedUp = Number(dealRow.votes_weighted_up);
    const weightedDown = Number(dealRow.votes_weighted_down);
    const expectedTemperature = calculateDealTemperature(weightedUp, weightedDown);
    const dbTemperature = Number(dealRow.temperature);
    expect(dbTemperature).toBe(expectedTemperature);

    const voteAudit = await waitForAuditLog(supabase, "deal.voted", 10, auditSince, auditRequestId);
    expect(voteAudit).toBeTruthy();
    expect(voteAudit.security?.temperature_changed).toBe(true);
    expect(voteAudit.security?.deal_id).toBe(dealId);

    const replayRes = await request.post(`/api/v1/deals/${dealId}/vote`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": voteKey },
      data: { direction: "up", reason: "Excellent price vs MSRP." }
    });
    await expectStatus(replayRes, 201);
    expect(replayRes.headers()["idempotency-replayed"]).toBe("true");

    const dupRes = await request.post(`/api/v1/deals/${dealId}/vote`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: { direction: "up", reason: "Same vote again" }
    });
    expect(dupRes.status()).toBe(409);
    const dupBody = await dupRes.json();
    expect(dupBody.error.code).toBe("ALREADY_VOTED");
  });

  test("deal vote rejected when expired and temperature frozen", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const createRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Expired Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 49.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        tags: ["expired"]
      }
    });
    await expectStatus(createRes, 201);
    const created = await createRes.json();
    const dealId = created.deal.deal_id;

    const { error: expireError } = await supabase.from("deals").update({ status: "EXPIRED", temperature: 42 }).eq("deal_id", dealId);
    expect(expireError).toBeNull();

    const voteRes = await request.post(`/api/v1/deals/${dealId}/vote`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: { direction: "down", reason: "Expired" }
    });
    expect(voteRes.status()).toBe(409);
    const voteBody = await voteRes.json();
    expect(voteBody.error.code).toBe("DEAL_EXPIRED");

    const { data: frozen, error: frozenError } = await supabase.from("deals").select("temperature").eq("deal_id", dealId).single();
    expect(frozenError).toBeNull();
    expect(frozen.temperature).toBe(42);
  });

  test("create deal with deal_type, country, merchant auto-extraction", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    // Create a LOCAL deal with country and a known merchant URL.
    const payload = {
      title: "Local Amazon Deal",
      url: `https://www.amazon.fr/dp/${randomId()}`,
      price: 59.99,
      currency: "EUR",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      tags: ["merchant-test"],
      deal_type: "LOCAL",
      country: "FR"
    };

    const res = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: payload
    });
    await expectStatus(res, 201);
    const body = await res.json();
    const deal = body.deal;

    // Verify response includes new fields.
    expect(deal.deal_type).toBe("LOCAL");
    expect(deal.country).toBe("FR");
    expect(deal.merchant_name).toBe("Amazon");
    expect(deal.merchant_domain).toBe("amazon.fr");

    // Verify DB persistence.
    const { data: row, error } = await supabase
      .from("deals")
      .select("deal_type, country, merchant_name, merchant_domain")
      .eq("deal_id", deal.deal_id)
      .single();
    expect(error).toBeNull();
    expect(row?.deal_type).toBe("LOCAL");
    expect(row?.country).toBe("FR");
    expect(row?.merchant_name).toBe("Amazon");
    expect(row?.merchant_domain).toBe("amazon.fr");

    // GET detail also returns the new fields.
    const getRes = await request.get(`/api/v1/deals/${deal.deal_id}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(getRes, 200);
    const getBody = await getRes.json();
    expect(getBody.deal.deal_type).toBe("LOCAL");
    expect(getBody.deal.country).toBe("FR");
    expect(getBody.deal.merchant_name).toBe("Amazon");
    expect(getBody.deal.merchant_domain).toBe("amazon.fr");
  });

  test("create deal defaults: deal_type=ONLINE, merchant auto-extracted, country null", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const res = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Default Fields Deal",
        url: `https://www.fnac.com/p/${randomId()}`,
        price: 29.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["defaults"]
      }
    });
    await expectStatus(res, 201);
    const deal = (await res.json()).deal;

    expect(deal.deal_type).toBe("ONLINE");
    expect(deal.country).toBeNull();
    expect(deal.merchant_name).toBe("Fnac");
    expect(deal.merchant_domain).toBe("fnac.com");
  });

  test("create deal with explicit merchant_name overrides auto-extraction", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const res = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Custom Merchant Deal",
        url: `https://www.amazon.fr/dp/${randomId()}`,
        price: 99.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["custom-merchant"],
        merchant_name: "Amazon Warehouse"
      }
    });
    await expectStatus(res, 201);
    const deal = (await res.json()).deal;

    // Agent-provided name takes precedence.
    expect(deal.merchant_name).toBe("Amazon Warehouse");
    // Domain is still auto-extracted.
    expect(deal.merchant_domain).toBe("amazon.fr");
  });

  test("create deal rejects invalid deal_type and country", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const base = {
      title: "Validation Deal",
      url: `https://example.com/p/${randomId()}`,
      price: 10,
      currency: "EUR",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      tags: ["validation"]
    };

    // Invalid deal_type.
    const badType = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: { ...base, deal_type: "INVALID" }
    });
    expect(badType.status()).toBe(400);
    const badTypeBody = await badType.json();
    expect(badTypeBody.error.code).toBe("VALIDATION_ERROR");

    // Invalid country (3 chars).
    const badCountry = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: { ...base, country: "FRA" }
    });
    expect(badCountry.status()).toBe(400);
    const badCountryBody = await badCountry.json();
    expect(badCountryBody.error.code).toBe("VALIDATION_ERROR");
  });

  test("PATCH deal updates deal_type, country, merchant_name", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const createRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Patchable Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 49.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["patch"]
      }
    });
    await expectStatus(createRes, 201);
    const dealId = (await createRes.json()).deal.deal_id;

    // PATCH to LOCAL + FR + custom merchant.
    const patchRes = await request.patch(`/api/v1/deals/${dealId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: { deal_type: "LOCAL", country: "DE", merchant_name: "Saturn" }
    });
    await expectStatus(patchRes, 200);
    const patched = (await patchRes.json()).deal;
    expect(patched.deal_type).toBe("LOCAL");
    expect(patched.country).toBe("DE");
    expect(patched.merchant_name).toBe("Saturn");

    // PATCH merchant_name to null (clear it).
    const clearRes = await request.patch(`/api/v1/deals/${dealId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: { merchant_name: null }
    });
    await expectStatus(clearRes, 200);
    const cleared = (await clearRes.json()).deal;
    expect(cleared.merchant_name).toBeNull();
    expect(cleared.deal_type).toBe("LOCAL");
  });

  test("deal feed returns new fields in list response", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const runTag = `merchant_${randomId().split("-")[0]}`;

    const res = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: `Feed merchant deal ${runTag}`,
        url: `https://www.darty.com/p/${randomId()}`,
        price: 199.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: [runTag],
        deal_type: "LOCAL",
        country: "FR"
      }
    });
    await expectStatus(res, 201);

    const listRes = await request.get(`/api/v1/deals?sort=new&tags=${runTag}&limit=10`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(listRes, 200);
    const listBody = await listRes.json();
    expect(listBody.items.length).toBeGreaterThanOrEqual(1);

    const item = listBody.items[0];
    expect(item.market_code).toBe("FR");
    expect(item.deal_type).toBe("LOCAL");
    expect(item.country).toBe("FR");
    expect(item.merchant_name).toBe("Darty");
    expect(item.merchant_domain).toBe("darty.com");
  });

  test("rate limit returns standard headers", async ({ request }) => {
    test.skip(skipRateLimitTests, "rate limit standard headers");
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    let rateLimited = false;
    for (let i = 0; i < 25; i += 1) {
      const res = await request.post("/api/v1/deals", {
        headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
        data: {
          title: `Rate limit deal ${i}`,
          url: `https://example.com/p/${randomId()}`,
          price: 9.99,
          currency: "EUR",
          expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          tags: ["ratelimit"]
        }
      });
      if (res.status() === 429) {
        rateLimited = true;
        expect(res.headers()["retry-after"]).toBeTruthy();
        break;
      }
    }
    expect(rateLimited).toBe(true);
  });
});
