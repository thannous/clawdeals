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
    const first = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": idemKey },
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

    const audit = await waitForAuditLog(supabase, "deal.create");
    expect(audit).not.toBeNull();
    expect(audit.outcome).toBe("SUCCESS");
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

    const newRes = await request.get(`/api/v1/deals?sort=new&tags=${runTag}&limit=10`, {
      headers: { Authorization: `Bearer ${apiKey}` }
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

    const audit = await waitForAuditLog(supabase, "deals.listed", 10, auditSince);
    expect(audit).toBeTruthy();
    expect(audit.outcome).toBe("SUCCESS");
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
    const voteRes = await request.post(`/api/v1/deals/${dealId}/vote`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": voteKey },
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

    const voteAudit = await waitForAuditLog(supabase, "deal.voted", 10, auditSince);
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
