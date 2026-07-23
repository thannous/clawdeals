import { afterEach, describe, expect, it, vi } from "vitest";

import { claimSession, denySession, fetchClaimSession } from "./api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("claim api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a missing claim token without making a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any);

    await expect(fetchClaimSession("   ")).resolves.toEqual({
      ok: false,
      error: "Missing token"
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches and validates a claim session", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValue(jsonResponse({ data: { session_id: "session-1", status: "PENDING" } }) as any);

    await expect(fetchClaimSession(" token/with spaces ")).resolves.toMatchObject({
      ok: true,
      data: { session_id: "session-1" }
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/connect/claims/token%2Fwith%20spaces",
      { method: "GET" }
    );
  });

  it("returns the API error and rejects malformed success payloads", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValueOnce(jsonResponse({ error: { message: "Expired claim" } }, 410) as any)
      .mockResolvedValueOnce(jsonResponse({ data: { status: "PENDING" } }) as any);

    await expect(fetchClaimSession("expired")).resolves.toEqual({
      ok: false,
      status: 410,
      error: "Expired claim"
    });
    await expect(fetchClaimSession("malformed")).resolves.toEqual({
      ok: false,
      status: 200,
      error: "Unexpected response: missing session_id"
    });
  });

  it("reports network failures while fetching a claim", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockRejectedValue(new Error("offline"));

    await expect(fetchClaimSession("token")).resolves.toEqual({
      ok: false,
      error: "offline"
    });
  });

  it("claims a session through the authenticated endpoint with an idempotency key", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValue(jsonResponse({ data: { agent_id: "agent-1" } }, 201) as any);

    await expect(
      claimSession({
        sessionId: "session/1",
        claimToken: "claim-1",
        mode: "create_agent",
        agentName: "Deal Scout"
      })
    ).resolves.toEqual({ ok: true, data: { agent_id: "agent-1" } });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/connect/sessions/session%2F1/claim");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "Idempotency-Key": expect.any(String)
    });
    expect(JSON.parse(String(init.body))).toEqual({
      claim_token: "claim-1",
      mode: "create_agent",
      agent_name: "Deal Scout"
    });
  });

  it("normalizes claim and deny errors", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValueOnce(jsonResponse({ error: "Already claimed" }, 409) as any)
      .mockResolvedValueOnce(jsonResponse({ message: "Cannot deny" }, 422) as any);

    await expect(
      claimSession({ sessionId: "session-1", claimToken: "claim-1", mode: "attach_agent" })
    ).resolves.toEqual({ ok: false, status: 409, error: "Already claimed" });
    await expect(
      denySession({ sessionId: "session-1", claimToken: "claim-1" })
    ).resolves.toEqual({ ok: false, status: 422, error: "Cannot deny" });
  });

  it("denies a session with the claim token and an idempotency key", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValue(jsonResponse({ data: { status: "DENIED" } }) as any);

    await expect(
      denySession({ sessionId: "session 1", claimToken: "claim-1" })
    ).resolves.toEqual({ ok: true, data: { status: "DENIED" } });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/connect/sessions/session%201/deny");
    expect(init.headers).toMatchObject({ "Idempotency-Key": expect.any(String) });
    expect(JSON.parse(String(init.body))).toEqual({ claim_token: "claim-1" });
  });
});
