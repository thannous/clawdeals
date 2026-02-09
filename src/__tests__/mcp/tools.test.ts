import { describe, expect, it, vi } from "vitest";

describe("MCP tools mapping", () => {
  it("joins tags/status for clawdeals.deals.list", async () => {
    const { buildRequest } = await import("../../../scripts/mcp/tools.mjs");

    const req: any = buildRequest("clawdeals.deals.list", {
      tags: ["gpu", "nvidia"],
      status: ["NEW", "ACTIVE"]
    });

    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v1/deals");
    expect(req.query.tags).toBe("gpu,nvidia");
    expect(req.query.status).toBe("NEW,ACTIVE");
  });

  it("extracts idempotency key and strips it from body (clawdeals.deals.create)", async () => {
    const { buildRequest } = await import("../../../scripts/mcp/tools.mjs");

    const req: any = buildRequest("clawdeals.deals.create", {
      idempotency_key: "idem-1",
      title: "Test Deal",
      url: "https://example.com/deal",
      price: 10,
      currency: "EUR",
      expires_at: "2026-02-09T12:00:00Z"
    });

    expect(req.method).toBe("POST");
    expect(req.path).toBe("/v1/deals");
    expect(req.idempotencyKey).toBe("idem-1");
    expect(req.body.idempotency_key).toBeUndefined();
  });

  it("returns NOT_SUPPORTED for dry_run on write tools and does not call fetch", async () => {
    const { executeTool } = await import("../../../scripts/mcp/tools.mjs");

    const fetchSpy = vi.fn(async () => {
      throw new Error("fetch should not be called");
    });

    const result: any = await executeTool(
      "clawdeals.deals.create",
      {
        dry_run: true,
        idempotency_key: "idem-1",
        title: "Test Deal",
        url: "https://example.com/deal",
        price: 10,
        currency: "EUR",
        expires_at: "2026-02-09T12:00:00Z"
      },
      { requestId: "req-1", fetchImpl: fetchSpy }
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("NOT_SUPPORTED");
    expect(result.meta.request_id).toBe("req-1");
  });
});

