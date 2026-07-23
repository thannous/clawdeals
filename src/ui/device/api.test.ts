import { afterEach, describe, expect, it, vi } from "vitest";

import { approveDevice, denyDevice, fetchDeviceRequest } from "./api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("device authorization api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a missing user code without making a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any);

    await expect(fetchDeviceRequest(" ")).resolves.toEqual({
      ok: false,
      error: "Missing user code"
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches and validates a device authorization", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValue(jsonResponse({ data: { authorization_id: "auth-1", status: "PENDING" } }) as any);

    await expect(fetchDeviceRequest(" ABC/12 ")).resolves.toMatchObject({
      ok: true,
      data: { authorization_id: "auth-1" }
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/oauth/device/requests?user_code=ABC%2F12",
      { method: "GET" }
    );
  });

  it("normalizes fetch errors and malformed success payloads", async () => {
    vi.spyOn(globalThis, "fetch" as any)
      .mockResolvedValueOnce(jsonResponse({ error: { msg: "Unknown code" } }, 404) as any)
      .mockResolvedValueOnce(jsonResponse({ data: { status: "PENDING" } }) as any);

    await expect(fetchDeviceRequest("missing")).resolves.toEqual({
      ok: false,
      status: 404,
      error: "Unknown code"
    });
    await expect(fetchDeviceRequest("invalid")).resolves.toEqual({
      ok: false,
      status: 200,
      error: "Unexpected response: missing authorization_id"
    });
  });

  it("approves a device request with the selected agent mode", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValue(jsonResponse({ data: { status: "APPROVED" } }) as any);

    await expect(
      approveDevice({
        userCode: "ABCD-1234",
        mode: "attach_agent",
        attachAgentId: "agent-1"
      })
    ).resolves.toEqual({ ok: true, data: { status: "APPROVED" } });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/console/oauth/device/approve");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "Idempotency-Key": expect.any(String)
    });
    expect(JSON.parse(String(init.body))).toEqual({
      user_code: "ABCD-1234",
      mode: "attach_agent",
      attach_agent_id: "agent-1"
    });
  });

  it("denies a device request with an idempotency key", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValue(jsonResponse({ status: "DENIED" }) as any);

    await expect(denyDevice({ userCode: "ABCD-1234" })).resolves.toEqual({
      ok: true,
      data: { status: "DENIED" }
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ "Idempotency-Key": expect.any(String) });
    expect(JSON.parse(String(init.body))).toEqual({ user_code: "ABCD-1234" });
  });

  it("returns API and network failures without throwing", async () => {
    vi.spyOn(globalThis, "fetch" as any)
      .mockResolvedValueOnce(jsonResponse({ message: "Approval expired" }, 410) as any)
      .mockRejectedValueOnce(new Error("offline"));

    await expect(
      approveDevice({ userCode: "ABCD-1234", mode: "create_agent", agentName: "Scout" })
    ).resolves.toEqual({ ok: false, status: 410, error: "Approval expired" });
    await expect(denyDevice({ userCode: "ABCD-1234" })).resolves.toEqual({
      ok: false,
      error: "offline"
    });
  });
});
