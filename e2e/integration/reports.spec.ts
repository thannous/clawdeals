import { test, expect } from "@playwright/test";

import { assertIntegrationEnv, skipRateLimitTests } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus } from "./helpers/http";
import { waitForAuditLog } from "./helpers/audit";
import { createSupabaseAdmin, setupAgent } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Reports & Moderation", () => {
  test.setTimeout(60000);

  test("rate limit reports create", async ({ request }) => {
    test.skip(skipRateLimitTests, "rate limit reports create");
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const supabase = createSupabaseAdmin();
    const { agent, apiKey } = await setupAgent(supabase);

    let limited = false;
    for (let i = 0; i < 6; i += 1) {
      const res = await request.post("/api/v1/reports", {
        headers: {
          "x-forwarded-for": ip,
          Authorization: `Bearer ${apiKey}`,
          "Idempotency-Key": randomId()
        },
        data: {
          entity_type: "listing",
          entity_id: randomId(),
          reason_code: "spam",
          free_text: `report-${i}`
        }
      });
      if (res.status() === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
    expect(agent).toBeTruthy();
  });

  test("create report OK + audit + report_weight", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const auditSince = new Date().toISOString();
    const { apiKey } = await setupAgent(supabase);

    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Report Target Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 99.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["report"]
      }
    });
    await expectStatus(dealRes, 201);
    const dealBody = await dealRes.json();
    const dealId = dealBody.deal ? dealBody.deal.deal_id : dealBody.data?.deal_id;

    const auditRequestId = randomId();
    const reportRes = await request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId(), "x-request-id": auditRequestId },
      data: {
        entity_type: "deal",
        entity_id: dealId,
        reason_code: "spam",
        free_text: "integration test report"
      }
    });
    await expectStatus(reportRes, 201);
    const reportBody = await reportRes.json();
    expect(reportBody.data.report_id).toBeTruthy();
    expect(reportBody.data.report_weight).toBeGreaterThanOrEqual(0);

    const audit = await waitForAuditLog(supabase, "report.created", 10, auditSince, auditRequestId);
    expect(audit).not.toBeNull();
    expect(audit.outcome).toBe("SUCCESS");
  });

  test("create report duplicate returns 409", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Dup Report Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 49.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["dupreport"]
      }
    });
    await expectStatus(dealRes, 201);
    const dealBody = await dealRes.json();
    const dealId = dealBody.deal ? dealBody.deal.deal_id : dealBody.data?.deal_id;

    const firstReport = await request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        entity_type: "deal",
        entity_id: dealId,
        reason_code: "spam",
        free_text: "first report"
      }
    });
    await expectStatus(firstReport, 201);

    const dupReport = await request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        entity_type: "deal",
        entity_id: dealId,
        reason_code: "spam",
        free_text: "dup report"
      }
    });
    expect(dupReport.status()).toBe(409);
    const dupBody = await dupReport.json();
    expect(dupBody.error.code).toBe("REPORT_DUPLICATE");
  });

  test("auto-hide when threshold met with diverse reporters", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey: apiKey1 } = await setupAgent(supabase);

    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey1}`, "Idempotency-Key": randomId() },
      data: {
        title: "Auto-hide Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 19.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["autohide"]
      }
    });
    await expectStatus(dealRes, 201);
    const dealBody = await dealRes.json();
    const dealId = dealBody.deal ? dealBody.deal.deal_id : dealBody.data?.deal_id;

    const oldCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    for (let i = 0; i < 4; i += 1) {
      const { apiKey, agent } = await setupAgent(supabase);
      // Boost trust score to max, clear flags, and age the agent past quarantine (7 days)
      await supabase
        .from("agents")
        .update({ trust_score: 100, trust_flags: [], created_at: oldCreatedAt })
        .eq("id", agent.id);
      const reportRes = await request.post("/api/v1/reports", {
        headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
        data: {
          entity_type: "deal",
          entity_id: dealId,
          reason_code: "scam",
          free_text: `diverse report ${i}`
        }
      });
      await expectStatus(reportRes, 201);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    const { data: modState, error } = await supabase
      .from("moderation_states")
      .select("hidden")
      .eq("entity_type", "deal")
      .eq("entity_id", dealId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(modState?.hidden).toBe(true);
  });

  test("quarantined reporter has weight=0 and cannot trigger auto-hide", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Quarantine-report Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 19.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["quarantine"]
      }
    });
    await expectStatus(dealRes, 201);
    const dealBody = await dealRes.json();
    const dealId = dealBody.deal ? dealBody.deal.deal_id : dealBody.data?.deal_id;

    const reportRes = await request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        entity_type: "deal",
        entity_id: dealId,
        reason_code: "spam",
        free_text: "quarantine test"
      }
    });
    await expectStatus(reportRes, 201);
    const reportBody = await reportRes.json();
    expect(reportBody.data.report_weight).toBeLessThanOrEqual(0.5);
  });
});
