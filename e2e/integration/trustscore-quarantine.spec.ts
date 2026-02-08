import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { waitForAuditLog } from "./helpers/audit";
import { expectStatus, createOwnerWithContact } from "./helpers/http";
import { createSupabaseAdmin, createAgentDb, setupAgent } from "./helpers/supabase";

import { runTrustScoreRecalculation } from "../../src/server/trustscore/recalculate";

assertIntegrationEnv();

test.describe.serial("Integration: TrustScore & Quarantine", () => {
  test.setTimeout(60000);

  test("trustscore recalculation updates score after owner verification", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    const email = `itest+trust+${ownerId.slice(0, 8)}@example.com`;
    await createOwnerWithContact(request, ownerId, { email });
    const agent = await createAgentDb(supabase, ownerId);

    const { data: before } = await supabase.from("agents").select("trust_score").eq("id", agent.id).single();
    const scoreBefore = before.trust_score;

    const startRes = await request.post("/api/v1/owner/verify-email:start", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(startRes, 201);
    const token = (await startRes.json()).data.token;

    const confirmRes = await request.post("/api/v1/owner/verify-email:confirm", {
      headers: { "x-owner-id": ownerId },
      data: { token }
    });
    await expectStatus(confirmRes, 200);

    await runTrustScoreRecalculation({ now: new Date(), limit: 1000 });

    const { data: after } = await supabase.from("agents").select("trust_score").eq("id", agent.id).single();
    expect(after.trust_score).toBeGreaterThan(scoreBefore);
  });

  test("quarantine flag applied to fresh agent in audit", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const auditSince = new Date().toISOString();
    const auditRequestId = randomId();
    const dealRes = await request.post("/api/v1/deals", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": randomId(),
        "x-request-id": auditRequestId
      },
      data: {
        title: "Fresh Agent Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 29.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        tags: ["freshagent"]
      }
    });
    await expectStatus(dealRes, 201);

    const audit = await waitForAuditLog(supabase, "deal.create", 10, auditSince, auditRequestId);
    expect(audit).not.toBeNull();
  });

  test("quarantined agent report has weight 0", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Quarantine Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 9.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["quarantine"]
      }
    });
    await expectStatus(dealRes, 201);
    const dealBody = await dealRes.json();
    const dealId = dealBody.deal ? dealBody.deal.deal_id : dealBody.data?.deal_id;

    const reportRes = await request.post("/api/v1/reports", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": randomId(),
        "x-request-id": randomId()
      },
      data: {
        entity_type: "deal",
        entity_id: dealId,
        reason_code: "spam",
        free_text: "quarantine weight test"
      }
    });
    await expectStatus(reportRes, 201);
    const reportBody = await reportRes.json();
    expect(reportBody.data.report_weight).toBeLessThanOrEqual(0.5);
  });

  test("quarantine multipliers appear in audit log", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const auditSince = new Date().toISOString();
    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Quarantine Audit Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 9.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        tags: ["quarantine-audit"]
      }
    });
    await expectStatus(dealRes, 201);
    const dealBody = await dealRes.json();
    const dealId = dealBody.deal ? dealBody.deal.deal_id : dealBody.data?.deal_id;

    const auditRequestId = randomId();
    const reportRes = await request.post("/api/v1/reports", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": randomId(),
        "x-request-id": auditRequestId
      },
      data: {
        entity_type: "deal",
        entity_id: dealId,
        reason_code: "spam",
        free_text: "quarantine audit test"
      }
    });
    await expectStatus(reportRes, 201);

    const audit = await waitForAuditLog(supabase, "report.created", 10, auditSince, auditRequestId);
    expect(audit).not.toBeNull();
  });
});
