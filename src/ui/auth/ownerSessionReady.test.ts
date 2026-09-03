import { afterEach, describe, expect, it, vi } from "vitest";

import { waitForOwnerSessionReady } from "./ownerSessionReady";

function sessionResponse(authenticated: boolean) {
  return {
    status: 200,
    ok: true,
    json: async () => ({ data: { authenticated, owner_id: authenticated ? "owner-1" : null } })
  } as unknown as Response;
}

describe("waitForOwnerSessionReady", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stops retrying when the session probe answers anonymous", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sessionResponse(false));
    vi.stubGlobal("fetch", fetchMock);

    const hasSession = await waitForOwnerSessionReady();

    expect(hasSession).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/session");
  });

  it("retries transient failures and succeeds when session becomes ready", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 500,
        ok: false
      } as Response)
      .mockResolvedValueOnce(sessionResponse(true));
    vi.stubGlobal("fetch", fetchMock);

    const promise = waitForOwnerSessionReady({ attempts: 2 });
    await vi.runAllTimersAsync();
    const hasSession = await promise;

    expect(hasSession).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
