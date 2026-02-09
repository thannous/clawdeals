import fs from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const handlerExists = [
  path.join(process.cwd(), "src/pages/api/v1/ops/psp/status.ts"),
  path.join(process.cwd(), "src/pages/api/v1/ops/psp/status/index.ts"),
  path.join(process.cwd(), "src/pages/api/v1/ops/psp/status.js"),
  path.join(process.cwd(), "src/pages/api/v1/ops/psp/status/index.js")
].some((candidate) => fs.existsSync(candidate));

const suite = handlerExists ? describe : describe.skip;

suite("GET /v1/ops/psp/status", () => {
  const opsOwnerId = "00000000-0000-4000-a000-000000000000";

  const baseCtx: any = {
    ownerId: opsOwnerId,
    agentId: null,
    actor: { type: "owner", id: opsOwnerId },
    authError: null
  };

  let handler: any;
  let getPspConfigMock: any;

  beforeAll(async () => {
    vi.resetModules();

    vi.doMock("../../../../../server/services/psp-config", () => ({
      getPspConfig: vi.fn()
    }));

    ({ handler } = await import("../../../../../pages/api/v1/ops/psp/status"));

    const mod = await import("../../../../../server/services/psp-config");
    getPspConfigMock = vi.mocked(mod.getPspConfig);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when caller is not ops owner", async () => {
    getPspConfigMock.mockResolvedValue(null);

    const req: any = { method: "GET", headers: {}, query: {}, body: null };
    const nonOpsOwnerId = "11111111-1111-4111-8111-111111111111";
    const result: any = await handler(req, null, {
      ...baseCtx,
      ownerId: nonOpsOwnerId,
      actor: { type: "owner", id: nonOpsOwnerId }
    });

    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("PERMISSION_DENIED");
  });

  it("returns configured:false when PSP config does not exist", async () => {
    getPspConfigMock.mockResolvedValue(null);

    const req: any = { method: "GET", headers: {}, query: {}, body: null };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.configured).toBe(false);
  });

  it("returns configured:true with PSP config details", async () => {
    getPspConfigMock.mockResolvedValue({
      provider: "mock",
      mode: "sandbox",
      webhook_secret_ref: "env:PSP_WEBHOOK_SECRET",
      platform_fee_bps_default: 250,
      updated_at: "2026-02-09T00:00:00Z"
    } as any);

    const req: any = { method: "GET", headers: {}, query: {}, body: null };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.configured).toBe(true);
    expect(result.body.provider).toBe("mock");
    expect(result.body.mode).toBe("sandbox");
    expect(result.body.webhook_secret_ref).toContain("env:");
  });
});

