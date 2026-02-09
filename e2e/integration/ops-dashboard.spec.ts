import { test, expect } from "@playwright/test";

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
});

