import { afterEach, describe, expect, it, vi } from "vitest";

import { waitForOwnerSessionReady } from "./ownerSessionReady";

describe("waitForOwnerSessionReady", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stops retrying on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 401,
      ok: false
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const hasSession = await waitForOwnerSessionReady();

    expect(hasSession).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures and succeeds when session becomes ready", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 500,
        ok: false
      } as Response)
      .mockResolvedValueOnce({
        status: 200,
        ok: true
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const promise = waitForOwnerSessionReady({ attempts: 2 });
    await vi.runAllTimersAsync();
    const hasSession = await promise;

    expect(hasSession).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
