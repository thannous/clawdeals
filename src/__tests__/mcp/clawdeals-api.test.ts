import { describe, expect, it } from "vitest";

describe("callClawdeals", () => {
  it("maps 429 + Retry-After into meta.retry_after_seconds", async () => {
    const { callClawdeals } = await import("../../../scripts/mcp/clawdeals-api.mjs");

    const fetchImpl = async () => {
      return new Response(
        JSON.stringify({ error: { code: "RATE_LIMITED", message: "slow down", details: {} } }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "3"
          }
        }
      );
    };

    const result: any = await callClawdeals({
      method: "GET",
      path: "/v1/deals",
      query: {},
      body: null,
      idempotencyKey: null,
      requestId: "req-1",
      env: {
        NODE_ENV: "test",
        CLAWDEALS_API_KEY: "dummy",
        CLAWDEALS_API_BASE: "http://example.test/api",
        CLAWDEALS_ORIGIN: "mcp",
        CLAWDEALS_TIMEOUT_MS: "15000"
      },
      fetchImpl
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("RATE_LIMITED");
    expect(result.meta.request_id).toBe("req-1");
    expect(result.meta.retry_after_seconds).toBe(3);
  });

  it("returns ok=false for non-JSON responses", async () => {
    const { callClawdeals } = await import("../../../scripts/mcp/clawdeals-api.mjs");

    const fetchImpl = async () => {
      return new Response("not-json", { status: 500, headers: { "content-type": "text/plain" } });
    };

    const result: any = await callClawdeals({
      method: "GET",
      path: "/v1/deals",
      query: {},
      body: null,
      idempotencyKey: null,
      requestId: "req-1",
      env: {
        NODE_ENV: "test",
        CLAWDEALS_API_KEY: "dummy",
        CLAWDEALS_API_BASE: "http://example.test/api",
        CLAWDEALS_ORIGIN: "mcp",
        CLAWDEALS_TIMEOUT_MS: "15000"
      },
      fetchImpl
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("ERROR");
    expect(result.meta.request_id).toBe("req-1");
  });

  it("maps network failures to NETWORK_ERROR", async () => {
    const { callClawdeals } = await import("../../../scripts/mcp/clawdeals-api.mjs");

    const fetchImpl = async () => {
      throw new Error("network down");
    };

    const result: any = await callClawdeals({
      method: "GET",
      path: "/v1/deals",
      query: {},
      body: null,
      idempotencyKey: null,
      requestId: "req-1",
      env: {
        NODE_ENV: "test",
        CLAWDEALS_API_KEY: "dummy",
        CLAWDEALS_API_BASE: "http://example.test/api",
        CLAWDEALS_ORIGIN: "mcp",
        CLAWDEALS_TIMEOUT_MS: "15000"
      },
      fetchImpl
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("NETWORK_ERROR");
    expect(result.meta.request_id).toBe("req-1");
  });
});
