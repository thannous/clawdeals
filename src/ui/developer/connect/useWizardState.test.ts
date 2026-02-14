import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../api";
import { getStoredApiKey, getStoredLastEventId, setStoredApiKey, setStoredLastEventId } from "../storage";
import { useWizardState } from "./useWizardState";

vi.mock("../api", () => ({
  apiRequest: vi.fn()
}));

describe("useWizardState owner-session probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("preserves local connect state when /auth/me returns non-401", async () => {
    setStoredApiKey("cd_live_keep.me");
    setStoredLastEventId("evt-123");

    vi.mocked(apiRequest).mockRejectedValue(new Error("verify temporarily unavailable"));
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 500,
      ok: false
    } as Response);

    const { result } = renderHook(() => useWizardState());

    await waitFor(() => {
      expect(result.current.state.hasOwnerSession).toBe(true);
    });

    expect(getStoredApiKey()).toBe("cd_live_keep.me");
    expect(getStoredLastEventId()).toBe("evt-123");
  });

  it("clears stored API key when /auth/me returns 401 (anonymous user)", async () => {
    setStoredApiKey("cd_live_clear.me");
    setStoredLastEventId("evt-999");

    vi.mocked(apiRequest).mockResolvedValue({
      data: { data: null },
      headers: new Headers()
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false
    } as Response);

    const { result } = renderHook(() => useWizardState());

    await waitFor(() => {
      expect(result.current.state.hasOwnerSession).toBe(false);
    });

    expect(getStoredApiKey()).toBe(null);
    expect(getStoredLastEventId()).toBe(null);
    expect(result.current.state.apiKey).toBe(null);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("auto-claims anonymous agent when owner session is present", async () => {
    setStoredApiKey("cd_live_claim.me");
    let claimed = false;
    vi.mocked(apiRequest).mockImplementation(async (request: any) => {
      if (request?.path === "/v1/agents/me" && request?.method === "GET") {
        return {
          data: {
            data: {
              agent_id: "agent-1",
              name: "chacha",
              owner_id: claimed ? "owner-1" : null,
              installation_id: "install-1",
              oauth_scopes: ["agent:read", "agent:write"]
            }
          },
          headers: new Headers()
        } as any;
      }
      if (request?.path === "/v1/agents/me/claim" && request?.method === "POST") {
        claimed = true;
        return {
          data: {
            data: {
              agent_id: "agent-1",
              owner_id: "owner-1",
              name: "chacha",
              claimed: true
            }
          },
          headers: new Headers()
        } as any;
      }
      throw new Error(`Unexpected apiRequest: ${request?.method} ${request?.path}`);
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          owner_id: "owner-1"
        }
      })
    } as any);

    const { result } = renderHook(() => useWizardState());

    await waitFor(() => {
      expect(result.current.state.verified).toBe(true);
      expect(result.current.state.agentMe?.owner_id).toBe("owner-1");
    });

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v1/agents/me/claim", method: "POST", apiKey: "cd_live_claim.me" })
    );
  });

  it("auto-claims when owner session appears after initial anonymous probe", async () => {
    let claimed = false;
    vi.mocked(apiRequest).mockImplementation(async (request: any) => {
      if (request?.path === "/v1/agents/me" && request?.method === "GET") {
        return {
          data: {
            data: {
              agent_id: "agent-1",
              name: "chacha",
              owner_id: claimed ? "owner-1" : "owner-placeholder",
              installation_id: "install-1",
              oauth_scopes: ["agent:read", "agent:write"]
            }
          },
          headers: new Headers()
        } as any;
      }
      if (request?.path === "/v1/agents/me/claim" && request?.method === "POST") {
        claimed = true;
        return {
          data: {
            data: {
              agent_id: "agent-1",
              owner_id: "owner-1",
              name: "chacha",
              claimed: true
            }
          },
          headers: new Headers()
        } as any;
      }
      throw new Error(`Unexpected apiRequest: ${request?.method} ${request?.path}`);
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 401,
        ok: false
      } as Response)
      .mockResolvedValueOnce({
        status: 401,
        ok: false
      } as Response)
      .mockResolvedValue({
        status: 200,
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            owner_id: "owner-1"
          }
        })
      } as any);
    globalThis.fetch = fetchMock as any;

    const { result } = renderHook(() => useWizardState());

    await waitFor(() => {
      expect(result.current.state.hasOwnerSession).toBe(false);
      expect(result.current.state.verified).toBe(false);
    });

    act(() => {
      result.current.setApiKey("cd_live_claim_later.me");
    });
    window.dispatchEvent(new Event("focus"));

    await waitFor(
      () => {
        expect(result.current.state.hasOwnerSession).toBe(true);
        expect(result.current.state.agentMe?.owner_id).toBe("owner-1");
        expect(result.current.state.verified).toBe(true);
      },
      { timeout: 6000 }
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v1/agents/me/claim", method: "POST", apiKey: "cd_live_claim_later.me" })
    );
  });

  it("persists key entered before owner-session probe resolves to signed-in owner", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      data: { data: null },
      headers: new Headers()
    });

    let resolveProbe: ((value: Response) => void) | null = null;
    const probePromise = new Promise<Response>((resolve) => {
      resolveProbe = resolve;
    });
    globalThis.fetch = vi.fn().mockReturnValue(probePromise);

    const { result } = renderHook(() => useWizardState());

    act(() => {
      result.current.setApiKey("cd_live_owner_race.me");
    });
    expect(getStoredApiKey()).toBe(null);

    resolveProbe?.({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          owner_id: "owner-1"
        }
      })
    } as any);

    await waitFor(() => {
      expect(result.current.state.hasOwnerSession).toBe(true);
    });

    expect(getStoredApiKey()).toBe("cd_live_owner_race.me");
  });

  it("does not start reconcile interval while anonymous", async () => {
    setStoredApiKey("cd_live_no_poll_anonymous.me");
    setStoredLastEventId("evt-local");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    vi.mocked(apiRequest).mockResolvedValue({
      data: { data: null },
      headers: new Headers()
    });

    const fetchMock = vi.fn().mockResolvedValue({
      status: 401,
      ok: false
    } as Response);
    globalThis.fetch = fetchMock as any;

    const { result } = renderHook(() => useWizardState());

    await waitFor(() => {
      expect(result.current.state.hasOwnerSession).toBe(false);
      expect(result.current.state.verified).toBe(false);
    });

    expect(result.current.state.apiKey).toBe(null);
    expect(getStoredApiKey()).toBe(null);
    expect(getStoredLastEventId()).toBe(null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(apiRequest).not.toHaveBeenCalled();

    const reconcileIntervals = setIntervalSpy.mock.calls.filter((call) => Number(call[1]) === 5000);
    expect(reconcileIntervals).toHaveLength(0);
    setIntervalSpy.mockRestore();
  });

  it("stops auto-claim retries after AGENT_ALREADY_CLAIMED", async () => {
    setStoredApiKey("cd_live_claim_conflict.me");

    let claimAttemptCount = 0;
    vi.mocked(apiRequest).mockImplementation(async (request: any) => {
      if (request?.path === "/v1/agents/me" && request?.method === "GET") {
        return {
          data: {
            data: {
              agent_id: "agent-1",
              name: "chacha",
              owner_id: null,
              installation_id: "install-1",
              oauth_scopes: ["agent:read", "agent:write"]
            }
          },
          headers: new Headers()
        } as any;
      }
      if (request?.path === "/v1/agents/me/claim" && request?.method === "POST") {
        claimAttemptCount += 1;
        throw {
          status: 409,
          code: "AGENT_ALREADY_CLAIMED",
          message: "Agent already linked to another owner"
        };
      }
      throw new Error(`Unexpected apiRequest: ${request?.method} ${request?.path}`);
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          owner_id: "owner-1"
        }
      })
    } as any);

    const { result } = renderHook(() => useWizardState());

    await waitFor(() => {
      expect(result.current.state.verified).toBe(true);
      expect(claimAttemptCount).toBeGreaterThan(0);
    });

    // Allow hydrate/reconcile handoff to finish before asserting steady-state.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const attemptsAfterFirstFailure = claimAttemptCount;
    await new Promise((resolve) => setTimeout(resolve, 11000));

    expect(result.current.state.hasOwnerSession).toBe(true);
    expect(claimAttemptCount - attemptsAfterFirstFailure).toBeLessThanOrEqual(1);
  }, 15000);
});
