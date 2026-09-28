import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "./api";

describe("developer api", () => {
  it("clears stale owner session cookie and retries once on invalid session cookie", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid session cookie" } }), {
          status: 401,
          headers: { "content-type": "application/json" }
        }) as any
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        }) as any
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { agent_id: "agent-123", api_key: "cd_live_abc" } }), {
          status: 201,
          headers: { "content-type": "application/json" }
        }) as any
      );

    const result = await apiRequest<{ data: { agent_id: string; api_key: string } }>({
      path: "/v1/agents",
      method: "POST",
      idempotencyKey: "idem-123",
      body: { name: "bot-burrito-candle-v2" }
    });

    expect(result.data?.data?.agent_id).toBe("agent-123");
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const logoutCall = fetchSpy.mock.calls[1] as any[];
    expect(String(logoutCall[0])).toContain("/api/v1/auth/logout");
    expect(logoutCall[1]?.method).toBe("POST");

    const retryCall = fetchSpy.mock.calls[2] as any[];
    expect(retryCall[1]?.headers?.["Idempotency-Key"]).toBe("idem-123");

    fetchSpy.mockRestore();
  });
});
