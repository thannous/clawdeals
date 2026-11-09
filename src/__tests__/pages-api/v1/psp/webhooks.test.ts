import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /v1/psp/webhooks", () => {
  let handler: any;
  let getPspConfigMock: any;

  beforeAll(async () => {
    vi.resetModules();

    vi.doMock("../../../../server/services/psp-config", () => ({
      getPspConfig: vi.fn()
    }));

    ({ handler } = await import("../../../../pages/api/v1/psp/webhooks"));

    const mod = await import("../../../../server/services/psp-config");
    getPspConfigMock = vi.mocked(mod.getPspConfig);
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 409 when webhook secret cannot be resolved (no 500 retry storm)", async () => {
    const envName = "PSP_WEBHOOK_SECRET_MISSING_FOR_TEST_9e3f5b64";
    delete process.env[envName];

    getPspConfigMock.mockResolvedValue({
      provider: "mock",
      mode: "sandbox",
      webhook_secret_ref: `env:${envName}`
    } as any);

    const req: any = { method: "POST", headers: {}, query: {}, body: {} };
    const result: any = await handler(req, null, { canonicalBody: "{}" });

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("PSP_WEBHOOK_MISCONFIGURED");
  });

  it("returns 400 when PSP provider is unsupported", async () => {
    const envName = "PSP_WEBHOOK_SECRET_FOR_TEST_3f82a2b1";
    process.env[envName] = "secret";

    getPspConfigMock.mockResolvedValue({
      provider: "stripe",
      mode: "sandbox",
      webhook_secret_ref: `env:${envName}`
    } as any);

    const req: any = { method: "POST", headers: {}, query: {}, body: {} };
    const result: any = await handler(req, null, { canonicalBody: "{}" });

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("PSP_PROVIDER_UNSUPPORTED");

    delete process.env[envName];
  });
});
