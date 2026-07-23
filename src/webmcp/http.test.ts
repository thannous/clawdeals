import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../ui/developer/storage", () => ({
  getStoredApiKey: vi.fn()
}));

import { getStoredApiKey } from "../ui/developer/storage";
import { callClawdealsWebmcp } from "./http";

describe("callClawdealsWebmcp", () => {
  beforeEach(() => {
    vi.mocked(getStoredApiKey).mockReturnValue("cd_live_test");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("fails before fetch when no API key is stored", async () => {
    vi.mocked(getStoredApiKey).mockReturnValue(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any);

    await expect(
      callClawdealsWebmcp({ method: "GET", path: "/v1/deals", requestId: "req-1" })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "API key required; go to /start",
        details: {}
      },
      meta: { request_id: "req-1" }
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("builds a GET request and preserves the response request id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "deal-1" }] }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-server"
        }
      }) as any
    );

    await expect(
      callClawdealsWebmcp({
        method: "GET",
        path: "/v1/deals",
        query: { limit: 2, active: false, q: "a b", ignored: null },
        requestId: "req-client"
      })
    ).resolves.toEqual({
      ok: true,
      data: { data: [{ id: "deal-1" }] },
      meta: { request_id: "req-server" }
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/deals?limit=2&active=false&q=a+b");
    expect(init.body).toBeUndefined();
    expect(init.headers).toMatchObject({
      authorization: "Bearer cd_live_test",
      "x-request-id": "req-client",
      "x-client-channel": "webmcp",
      "x-clawdeals-origin": "webmcp"
    });
  });

  it("serializes POST bodies and idempotency keys", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(
      new Response(JSON.stringify({ data: { listing_id: "listing-1" } }), {
        status: 201,
        headers: { "content-type": "application/json" }
      }) as any
    );

    await callClawdealsWebmcp({
      method: "POST",
      path: "/v1/listings",
      body: { title: "Desk" },
      idempotencyKey: "idem-1",
      requestId: "req-1"
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ title: "Desk" }));
    expect(init.headers).toMatchObject({ "idempotency-key": "idem-1" });
  });

  it("normalizes structured JSON errors", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "FORBIDDEN", message: "Scope missing", details: { scope: "deals:read" } }
        }),
        {
          status: 403,
          headers: { "content-type": "application/json", "x-request-id": "req-server" }
        }
      ) as any
    );

    await expect(
      callClawdealsWebmcp({ method: "GET", path: "/v1/deals", requestId: "req-client" })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "Scope missing",
        details: { scope: "deals:read" }
      },
      meta: { request_id: "req-server" }
    });
  });

  it("normalizes text, invalid JSON, and network responses", async () => {
    vi.spyOn(globalThis, "fetch" as any)
      .mockResolvedValueOnce(
        new Response("Gateway unavailable", {
          status: 502,
          headers: { "content-type": "text/plain" }
        }) as any
      )
      .mockResolvedValueOnce(
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" }
        }) as any
      )
      .mockRejectedValueOnce(new Error("offline"));

    await expect(
      callClawdealsWebmcp({ method: "GET", path: "/v1/deals", requestId: "req-text" })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "ERROR", message: "Gateway unavailable" }
    });
    await expect(
      callClawdealsWebmcp({ method: "GET", path: "/v1/deals", requestId: "req-json" })
    ).resolves.toEqual({ ok: true, data: {}, meta: { request_id: "req-json" } });
    await expect(
      callClawdealsWebmcp({ method: "GET", path: "/v1/deals", requestId: "req-network" })
    ).resolves.toEqual({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "offline", details: {} },
      meta: { request_id: "req-network" }
    });
  });
});
