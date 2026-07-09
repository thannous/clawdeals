import { consoleTest as test, expect } from "./helpers/fixtures";

import { assertIntegrationEnv } from "./helpers/env";
import { expectStatus } from "./helpers/http";

assertIntegrationEnv();

test.describe.serial("Integration: Ops Dashboard", () => {
  test.setTimeout(60000);

  test("GET /api/console/ops returns a dashboard payload", async ({ request }) => {
    const res = await request.get("/api/console/ops?window_minutes=15");
    await expectStatus(res, 200);
    const body: any = await res.json();

    expect(body.window?.minutes).toBe(15);
    expect(typeof body.window?.from).toBe("string");
    expect(typeof body.window?.to).toBe("string");

    expect(typeof body.http?.total).toBe("number");
    expect(typeof body.http?.status_5xx).toBe("number");

    expect(Array.isArray(body.latency?.by_route_group)).toBe(true);
    expect(Array.isArray(body.errors?.by_route_group)).toBe(true);
    expect(Array.isArray(body.rate_limit?.top_agents)).toBe(true);

    expect(typeof body.queue?.approvals_pending).toBe("number");
    expect(Array.isArray(body.queue?.job_queues)).toBe(true);
  });

  test("GET /api/console/ops returns SLI write_journeys fields", async ({ request }) => {
    const res = await request.get("/api/console/ops?window_minutes=15");
    await expectStatus(res, 200);
    const body: any = await res.json();

    // sli.write_journeys.aggregate
    const aggregate = body.sli?.write_journeys?.aggregate;
    expect(aggregate).toBeDefined();
    expect(typeof aggregate.budget_state).toBe("string");
    expect(["GREEN", "YELLOW", "RED", "EXHAUSTED"]).toContain(aggregate.budget_state);
    expect(typeof aggregate.total).toBe("number");
    expect(typeof aggregate.success).toBe("number");
    expect(typeof aggregate.slo_target).toBe("number");
    expect(typeof aggregate.error_budget_remaining_pct).toBe("number");

    // sli.write_journeys.by_event
    const byEvent = body.sli?.write_journeys?.by_event;
    expect(Array.isArray(byEvent)).toBe(true);
    for (const entry of byEvent) {
      expect(typeof entry.event).toBe("string");
      expect(typeof entry.total).toBe("number");
      expect(typeof entry.success).toBe("number");
    }

    // sli.write_journeys.events
    expect(Array.isArray(body.sli?.write_journeys?.events)).toBe(true);

    // sli.write_journeys.burn_rate
    const burnRate = body.sli?.write_journeys?.burn_rate;
    expect(burnRate).toBeDefined();
    expect(typeof burnRate.fast?.window_s).toBe("number");
    expect(typeof burnRate.slow?.window_s).toBe("number");
  });

  test("GET /api/console/ops returns approvals_detail fields", async ({ request }) => {
    const res = await request.get("/api/console/ops?window_minutes=15");
    await expectStatus(res, 200);
    const body: any = await res.json();

    const detail = body.approvals_detail;
    expect(detail).toBeDefined();
    expect(typeof detail.pending_count).toBe("number");

    // resolved_window sub-object
    const resolved = detail.resolved_window;
    expect(resolved).toBeDefined();
    expect(typeof resolved.count).toBe("number");
  });

  test("GET /api/console/ops returns slo_latency_targets", async ({ request }) => {
    const res = await request.get("/api/console/ops?window_minutes=15");
    await expectStatus(res, 200);
    const body: any = await res.json();

    expect(body.slo_latency_targets).toBeDefined();
    expect(typeof body.slo_latency_targets).toBe("object");
    // Verify it is a non-null object (not an array)
    expect(body.slo_latency_targets).not.toBeNull();
    expect(Array.isArray(body.slo_latency_targets)).toBe(false);
  });
});
