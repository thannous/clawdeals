import { renderHook, waitFor } from "@testing-library/react";
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

  it("preserves stored API key when /auth/me returns 401 (anonymous user)", async () => {
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

    // Key should NOT be cleared — anonymous users keep their generated key
    expect(getStoredApiKey()).toBe("cd_live_clear.me");
    expect(getStoredLastEventId()).toBe("evt-999");
    // Auto-verify should still be attempted with the stored key
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v1/agents/me", method: "GET", apiKey: "cd_live_clear.me" })
    );
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
    setStoredApiKey("cd_live_claim_later.me");
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
      expect(result.current.state.verified).toBe(true);
      expect(result.current.state.hasOwnerSession).toBe(false);
    });

    await waitFor(
      () => {
        expect(result.current.state.hasOwnerSession).toBe(true);
        expect(result.current.state.agentMe?.owner_id).toBe("owner-1");
      },
      { timeout: 12000 }
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v1/agents/me/claim", method: "POST", apiKey: "cd_live_claim_later.me" })
    );
  }, 15000);

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

    const attemptsAfterFirstFailure = claimAttemptCount;
    await new Promise((resolve) => setTimeout(resolve, 11000));

    expect(result.current.state.hasOwnerSession).toBe(true);
    expect(claimAttemptCount).toBe(attemptsAfterFirstFailure);
  }, 15000);
});
