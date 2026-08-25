import { describe, expect, it } from "vitest";

describe("callClawdeals", () => {
  it("defaults to production API base when CLAWDEALS_API_BASE is missing", async () => {
    const { callClawdeals } = await import("../../../scripts/mcp/clawdeals-api.mjs");
    let calledUrl = "";

    const fetchImpl = async (url: any) => {
      calledUrl = String(url);
      return new Response(JSON.stringify({ deals: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    const result: any = await callClawdeals({
      method: "GET",
      path: "/v1/deals",
      query: {},
      body: null,
      idempotencyKey: null,
      requestId: "req-missing-base",
      env: {
        NODE_ENV: "test",
        CLAWDEALS_API_KEY: "dummy",
        CLAWDEALS_ORIGIN: "mcp",
        CLAWDEALS_TIMEOUT_MS: "15000"
      },
      fetchImpl
    });

    expect(result.ok).toBe(true);
    expect(calledUrl).toBe("https://app.clawdeals.com/api/v1/deals");
    expect(result.meta.request_id).toBe("req-missing-base");
  });

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

  it("keeps the timeout active while reading the upstream response body", async () => {
    const { callClawdeals } = await import("../../../scripts/mcp/clawdeals-api.mjs");

    const fetchImpl = async (_url: any, init: any) => {
      const body = new ReadableStream({
        start(controller) {
          const timer = setTimeout(() => {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ deals: [] })));
            controller.close();
          }, 100);
          init.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            controller.error(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        }
      });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    const result: any = await callClawdeals({
      method: "GET",
      path: "/v1/deals",
      query: {},
      body: null,
      idempotencyKey: null,
      requestId: "req-slow-body",
      env: {
        NODE_ENV: "test",
        CLAWDEALS_API_KEY: "dummy",
        CLAWDEALS_API_BASE: "http://example.test/api",
        CLAWDEALS_ORIGIN: "mcp",
        CLAWDEALS_TIMEOUT_MS: "10"
      },
      fetchImpl
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "TIMEOUT" },
      meta: { request_id: "req-slow-body" }
    });
  });
});
