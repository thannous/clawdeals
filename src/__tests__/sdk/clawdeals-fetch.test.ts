import { describe, expect, it, vi } from "vitest";

import { createClawdealsFetch } from "../../../sdk/typescript/src/http";

describe("createClawdealsFetch", () => {
  it("injects Authorization, Idempotency-Key, and X-Request-Id", async () => {
    const seen: Array<{ auth: string | null; idem: string | null; reqId: string | null }> = [];

    const baseFetch = vi.fn(async (req: Request) => {
      seen.push({
        auth: req.headers.get("Authorization"),
        idem: req.headers.get("Idempotency-Key"),
        reqId: req.headers.get("X-Request-Id")
      });
      return new Response("ok", { status: 200 });
    });

    const logger = { debug: vi.fn() };
    const f = createClawdealsFetch({
      fetch: baseFetch as any,
      apiKeyBearer: "secret",
      logger
    });

    await f("https://example.test/v1/deals", { method: "POST", body: "{}" });

    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(seen[0].auth).toBe("Bearer secret");
    expect(seen[0].idem).toMatch(/[0-9a-f-]{36}/i);
    expect(seen[0].reqId).toMatch(/[0-9a-f-]{36}/i);

    // Ensure logs redact secrets.
    const meta = logger.debug.mock.calls[0]?.[1] as any;
    expect(meta.headers.authorization ?? meta.headers.Authorization).toBe("[REDACTED]");
  });

  it("retries on network errors with stable idempotency key", async () => {
    const idempotencyKeys: string[] = [];

    const baseFetch = vi
      .fn()
      .mockImplementationOnce(async (req: Request) => {
        idempotencyKeys.push(req.headers.get("Idempotency-Key")!);
        throw new TypeError("fetch failed");
      })
      .mockImplementationOnce(async (req: Request) => {
        idempotencyKeys.push(req.headers.get("Idempotency-Key")!);
        return new Response("ok", { status: 200 });
      });

    const f = createClawdealsFetch({
      fetch: baseFetch as any,
      retries: 1,
      retryDelayMs: 0,
      maxRetryDelayMs: 0
    });

    await f("https://example.test/v1/deals", { method: "POST", body: "{}" });

    expect(baseFetch).toHaveBeenCalledTimes(2);
    expect(idempotencyKeys[0]).toBeTruthy();
    expect(idempotencyKeys[1]).toBe(idempotencyKeys[0]);
  });

  it("retries on IDEMPOTENCY_IN_PROGRESS (409 + Retry-After)", async () => {
    const baseFetch = vi
      .fn()
      .mockImplementationOnce(async () => {
        return new Response(JSON.stringify({ error: { code: "IDEMPOTENCY_IN_PROGRESS" } }), {
          status: 409,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "0"
          }
        });
      })
      .mockImplementationOnce(async () => new Response("ok", { status: 200 }));

    const f = createClawdealsFetch({
      fetch: baseFetch as any,
      retries: 1,
      retryDelayMs: 0,
      maxRetryDelayMs: 0
    });

    const res = await f("https://example.test/v1/deals", { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });
});
