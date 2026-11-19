import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/inspection-auto-release", () => ({
  runInspectionAutoRelease: vi.fn()
}));

import handler from "../../../../pages/api/internal/cron/escrow-inspection-release";
import { runInspectionAutoRelease } from "../../../../server/services/inspection-auto-release";

function createMockRes() {
  const res: any = {
    status: vi.fn(() => res),
    json: vi.fn(() => res)
  };
  return res;
}

function request() {
  return {
    method: "POST",
    headers: { authorization: "Bearer secret-1" },
    query: {}
  } as any;
}

describe("POST /api/internal/cron/escrow-inspection-release", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, INTERNAL_CRON_SECRET: "secret-1" };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 503 when any payout fails and preserves counts for retry", async () => {
    const failed = { claimed_count: 2, released_count: 1, failed_count: 1 };
    const recovered = { claimed_count: 1, released_count: 1, failed_count: 0 };
    vi.mocked(runInspectionAutoRelease)
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(recovered);

    const failedRes = createMockRes();
    await handler(request(), failedRes);
    expect(failedRes.status).toHaveBeenCalledWith(503);
    expect(failedRes.json).toHaveBeenCalledWith(failed);

    const recoveredRes = createMockRes();
    await handler(request(), recoveredRes);
    expect(recoveredRes.status).toHaveBeenCalledWith(200);
    expect(recoveredRes.json).toHaveBeenCalledWith(recovered);
  });

  it("returns 503 when the payout job is skipped because the PSP is not configured", async () => {
    // The mock PSP succeeds by design; injected service results isolate dispatcher HTTP semantics.
    const skipped = {
      claimed_count: 0,
      released_count: 0,
      failed_count: 0,
      skipped: "PSP_NOT_CONFIGURED"
    };
    vi.mocked(runInspectionAutoRelease).mockResolvedValueOnce(skipped);
    const res = createMockRes();

    await handler(request(), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(skipped);
  });

  it("returns 200 when all claimed payouts succeed", async () => {
    const succeeded = { claimed_count: 2, released_count: 2, failed_count: 0 };
    vi.mocked(runInspectionAutoRelease).mockResolvedValueOnce(succeeded);
    const res = createMockRes();

    await handler(request(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(succeeded);
  });
});
