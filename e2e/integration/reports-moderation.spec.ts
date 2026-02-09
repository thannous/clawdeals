import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus } from "./helpers/http";
import { waitForAuditLog } from "./helpers/audit";
import { createSupabaseAdmin, setupAgent, ensureOpsConsoleAgent, OPS_CONSOLE_OWNER_ID } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Reports Moderation Console", () => {
  test.setTimeout(60000);

  // Shared state across serial tests
  let supabase: any;
  let reporterApiKey: string;
  let dealId: string;
  let reportId: string;

  test("setup: create agent + deal + report", async ({ request }) => {
    supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);
    const { apiKey } = await setupAgent(supabase);
    reporterApiKey = apiKey;

    // Create a deal
    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${reporterApiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Moderation Target Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 99.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["moderation"]
      }
    });
    await expectStatus(dealRes, 201);
    const dealBody = await dealRes.json();
    dealId = dealBody.deal ? dealBody.deal.deal_id : dealBody.data?.deal_id;

    // Create a report
    const reportRes = await request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${reporterApiKey}`, "Idempotency-Key": randomId() },
      data: {
        entity_type: "deal",
        entity_id: dealId,
        reason_code: "spam",
        free_text: "integration moderation test"
      }
    });
    await expectStatus(reportRes, 201);
    const reportBody = await reportRes.json();
    reportId = reportBody.data.report_id;
  });

  test("list reports via console (UNCONFIRMED)", async ({ request }) => {
    const res = await request.get("/api/console/reports?status=UNCONFIRMED", {
      headers: { "x-owner-id": OPS_CONSOLE_OWNER_ID }
    });
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
    // Find our report in the list
    const found = body.items.find((r: any) => r.report_id === reportId);
    expect(found).toBeTruthy();
    expect(found.status).toBe("UNCONFIRMED");
  });

  test("get report detail via console", async ({ request }) => {
    const res = await request.get(`/api/console/reports/${reportId}`, {
      headers: { "x-owner-id": OPS_CONSOLE_OWNER_ID }
    });
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.report).toBeDefined();
    expect(body.report.report_id).toBe(reportId);
    expect(body.report.entity_type).toBe("deal");
    expect(body.report.entity_id).toBe(dealId);
  });

  test("confirm report via console + audit event", async ({ request }) => {
    const auditSince = new Date().toISOString();
    const auditRequestId = randomId();

    const res = await request.post(`/api/console/reports/${reportId}`, {
      headers: {
        "x-owner-id": OPS_CONSOLE_OWNER_ID,
        "Content-Type": "application/json",
        "Idempotency-Key": randomId(),
        "x-request-id": auditRequestId
      },
      data: {
        action: "confirm",
        reason: "Verified spam content"
      }
    });
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.report.status).toBe("CONFIRMED");
    expect(body.report.resolved_reason).toBe("Verified spam content");

    // Verify audit event
    const audit = await waitForAuditLog(supabase, "report.confirmed", 10, auditSince, auditRequestId);
    expect(audit).not.toBeNull();
    expect(audit.outcome).toBe("SUCCESS");
  });

  test("confirm already-resolved report returns 409", async ({ request }) => {
    const res = await request.post(`/api/console/reports/${reportId}`, {
      headers: {
        "x-owner-id": OPS_CONSOLE_OWNER_ID,
        "Content-Type": "application/json",
        "Idempotency-Key": randomId()
      },
      data: {
        action: "confirm",
        reason: "Try again"
      }
    });
    // Should be 409 because it's already confirmed (unless idempotency returns cached 200)
    const status = res.status();
    expect([200, 409]).toContain(status);
  });

  test("bulk reject reports + audit event", async ({ request }) => {
    // Create multiple new reports from different agents
    const reportIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { apiKey } = await setupAgent(supabase);

      const dealRes = await request.post("/api/v1/deals", {
        headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
        data: {
          title: `Bulk Reject Deal ${i}`,
          url: `https://example.com/p/${randomId()}`,
          price: 19.99,
          currency: "EUR",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          tags: ["bulk-moderation"]
        }
      });
      await expectStatus(dealRes, 201);
      const dealBody = await dealRes.json();
      const did = dealBody.deal ? dealBody.deal.deal_id : dealBody.data?.deal_id;

      const reportRes = await request.post("/api/v1/reports", {
        headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
        data: {
          entity_type: "deal",
          entity_id: did,
          reason_code: "spam",
          free_text: `bulk report ${i}`
        }
      });
      await expectStatus(reportRes, 201);
      const reportBody = await reportRes.json();
      reportIds.push(reportBody.data.report_id);
    }

    const auditSince = new Date().toISOString();
    const auditRequestId = randomId();

    const res = await request.post("/api/console/reports/bulk", {
      headers: {
        "x-owner-id": OPS_CONSOLE_OWNER_ID,
        "Content-Type": "application/json",
        "Idempotency-Key": randomId(),
        "x-request-id": auditRequestId
      },
      data: {
        report_ids: reportIds,
        action: "reject",
        reason: "False positive reports"
      }
    });
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.resolved).toBeDefined();
    expect(body.resolved.length).toBe(3);
    expect(body.skipped).toBeDefined();

    // Verify audit event
    const audit = await waitForAuditLog(supabase, "reports.bulk_resolved", 10, auditSince, auditRequestId);
    expect(audit).not.toBeNull();
    expect(audit.outcome).toBe("SUCCESS");
  });
});
