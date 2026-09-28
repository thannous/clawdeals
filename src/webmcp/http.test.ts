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


  it("returns a stable ABORTED result without fetch when the signal is already aborted", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any);
    const controller = new AbortController();
    controller.abort();

    await expect(
      callClawdealsWebmcp({
        method: "GET",
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
