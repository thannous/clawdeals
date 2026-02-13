import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
