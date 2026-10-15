import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../ui/developer/storage", () => ({
  getStoredApiKey: vi.fn()
}));

import { getStoredApiKey } from "../ui/developer/storage";
import { callClawdealsWebmcp, callPublicWebmcp } from "./http";

describe("callClawdealsWebmcp", () => {
  beforeEach(() => {
    vi.mocked(getStoredApiKey).mockReturnValue("cd_live_test");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });


  it.each(["GET", "POST"] as const)("returns ABORTED without fetch for %s when the signal is already aborted", async method => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any);
    const controller = new AbortController();
    controller.abort();

    await expect(
      callClawdealsWebmcp({
        method,
        path: "/v1/deals",
        requestId: "req-aborted",
        signal: controller.signal
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "ABORTED",
        message: "Tool execution was cancelled",
        details: {}
      },
      meta: { request_id: "req-aborted" }
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards the invocation signal to fetch and maps AbortError to ABORTED", async () => {
    const controller = new AbortController();
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockImplementation(async (_url, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });

    await expect(
      callPublicWebmcp({
        method: "GET",
        path: "/v1/public/listings",
        requestId: "req-abort-fetch",
        signal: controller.signal
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "ABORTED",
        message: "Tool execution was cancelled",
        details: {}
      },
      meta: { request_id: "req-abort-fetch" }
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps a POST outcome unknown when it is cancelled after fetch starts", async () => {
    const controller = new AbortController();
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockImplementation(async (_url, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.signal).toBe(controller.signal);
      // Aborting the client cannot undo a request already sent to the server.
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });

    await expect(callClawdealsWebmcp({
      method: "POST", path: "/v1/watchlists", body: { name: "Desk" },
      requestId: "req-post-abort", idempotencyKey: "idem-post-abort", signal: controller.signal
    })).resolves.toEqual({
      ok: false,
      error: {
        code: "OUTCOME_UNKNOWN",
        message: "The write may have reached the server, so its outcome is unknown",
        details: { safe_to_retry: false }
      },
      meta: { request_id: "req-post-abort" }
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
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
    ).resolves.toEqual({
      ok: false,
      error: { code: "INVALID_RESPONSE", message: "Server returned an unreadable JSON response", details: {} },
      meta: { request_id: "req-json" }
    });
    await expect(
      callClawdealsWebmcp({ method: "GET", path: "/v1/deals", requestId: "req-network" })
    ).resolves.toEqual({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "offline", details: {} },
      meta: { request_id: "req-network" }
    });
  });

  it.each([
    { status: 200, contentType: "application/json", body: '{"data":' },
    { status: 201, contentType: "text/html", body: "<html>Gateway response</html>" },
    { status: 201, contentType: "application/json", body: "" }
  ])("does not retry or confirm a write with an unreadable $status $contentType response", async ({ status, contentType, body }) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(new Response(body, {
      status,
      headers: { "content-type": contentType, "x-request-id": "server-write-request" }
    }));

    await expect(callClawdealsWebmcp({
      method: "POST", path: "/v1/watchlists", body: { name: "Desk" },
      idempotencyKey: "idem-unreadable", requestId: "client-write-request"
    })).resolves.toEqual({
      ok: false,
      error: {
        code: "OUTCOME_UNKNOWN",
        message: "The write may have reached the server, so its outcome is unknown",
        details: { safe_to_retry: false }
      },
      meta: { request_id: "server-write-request" }
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each(["GET", "POST"] as const)("preserves a valid JSON success for %s", async method => {
    const payload = { data: { watchlist_id: "11111111-1111-4111-8111-111111111111" } };
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(new Response(JSON.stringify(payload), {
      status: method === "POST" ? 201 : 200,
      headers: { "content-type": "application/json; charset=utf-8", "x-request-id": "server-json-request" }
    }));

    await expect(callClawdealsWebmcp({
      method, path: "/v1/watchlists", requestId: "client-json-request"
    })).resolves.toEqual({ ok: true, data: payload, meta: { request_id: "server-json-request" } });
  });

  it("marks a transport failure after a write as an unsafe ambiguous outcome", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockRejectedValue(new Error("connection reset"));

    await expect(
      callClawdealsWebmcp({
        method: "POST",
        path: "/v1/listings",
        body: { title: "Desk" },
        idempotencyKey: "idem-write",
        requestId: "req-write-network"
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "OUTCOME_UNKNOWN",
        message: "The write may have reached the server, so its outcome is unknown",
        details: { safe_to_retry: false }
      },
      meta: { request_id: "req-write-network" }
    });
  });
});
