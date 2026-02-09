import fs from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const handlerExists = [
  path.join(process.cwd(), "src/pages/api/v1/ops/psp/configure.ts"),
  path.join(process.cwd(), "src/pages/api/v1/ops/psp/configure/index.ts"),
  path.join(process.cwd(), "src/pages/api/v1/ops/psp/configure.js"),
  path.join(process.cwd(), "src/pages/api/v1/ops/psp/configure/index.js")
].some((candidate) => fs.existsSync(candidate));

const suite = handlerExists ? describe : describe.skip;

suite("POST /v1/ops/psp/configure", () => {
  const opsOwnerId = "00000000-0000-4000-a000-000000000000";

  const baseCtx: any = {
    ownerId: opsOwnerId,
    agentId: null,
    actor: { type: "owner", id: opsOwnerId },
    authError: null
  };

  let handler: any;
  let upsertPspConfigMock: any;

  beforeAll(async () => {
    vi.resetModules();

    vi.doMock("../../../../../server/services/psp-config", () => ({
      upsertPspConfig: vi.fn()
    }));

    ({ handler } = await import("../../../../../pages/api/v1/ops/psp/configure"));

    const mod = await import("../../../../../server/services/psp-config");
    upsertPspConfigMock = vi.mocked(mod.upsertPspConfig);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    upsertPspConfigMock.mockResolvedValue({ provider: "mock", mode: "sandbox" } as any);
  });

  it("returns 403 when caller is not ops owner", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: {},
      body: {
        provider: "mock",
        mode: "sandbox",
        webhook_secret_ref: "env:PSP_WEBHOOK_SECRET",
        platform_fee_bps_default: 100
      }
    };

    const nonOpsOwnerId = "11111111-1111-4111-8111-111111111111";
    const result: any = await handler(req, null, {
      ...baseCtx,
      ownerId: nonOpsOwnerId,
      actor: { type: "owner", id: nonOpsOwnerId }
    });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("PERMISSION_DENIED");
  });

  it("requires Idempotency-Key", async () => {
    const req: any = {
      method: "POST",
      headers: {},
      query: {},
      body: {
        provider: "mock",
        mode: "sandbox",
        webhook_secret_ref: "env:PSP_WEBHOOK_SECRET",
        platform_fee_bps_default: 100
      }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("preserves non-validation errors from upsertPspConfig", async () => {
    const err: any = new Error("db down");
    err.status = 503;
    err.code = "DB_DOWN";
    upsertPspConfigMock.mockRejectedValueOnce(err);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: {},
      body: {
        provider: "mock",
        mode: "sandbox",
        webhook_secret_ref: "env:PSP_WEBHOOK_SECRET",
        platform_fee_bps_default: 100
      }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("DB_DOWN");
  });
});

