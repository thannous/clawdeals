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
  }, 15000);

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
  }, 15000);

  it("extracts idempotency key and strips it from body (clawdeals.deals.update)", async () => {
    const { buildRequest } = await import("../../../scripts/mcp/tools.mjs");

    const req: any = buildRequest("clawdeals.deals.update", {
      idempotency_key: "idem-2",
      deal_id: "00000000-0000-4000-a000-000000000123",
      price: 969,
      currency: "EUR"
    });

    expect(req.method).toBe("PATCH");
    expect(req.path).toBe("/v1/deals/00000000-0000-4000-a000-000000000123");
    expect(req.idempotencyKey).toBe("idem-2");
    expect(req.body.idempotency_key).toBeUndefined();
    expect(req.body.deal_id).toBeUndefined();
    expect(req.body.price).toBe(969);
  }, 15000);

  it("maps clawdeals.deals.delete to DELETE /v1/deals/:deal_id", async () => {
    const { buildRequest } = await import("../../../scripts/mcp/tools.mjs");

    const req: any = buildRequest("clawdeals.deals.delete", {
      idempotency_key: "idem-3",
      deal_id: "00000000-0000-4000-a000-000000000123"
    });

    expect(req.method).toBe("DELETE");
    expect(req.path).toBe("/v1/deals/00000000-0000-4000-a000-000000000123");
    expect(req.idempotencyKey).toBe("idem-3");
    expect(req.body).toBeUndefined();
  }, 15000);

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
  }, 15000);
});
