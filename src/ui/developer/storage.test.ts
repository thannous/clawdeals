import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  clearStoredApiKey,
  clearStoredLastEventId,
  getStoredApiKey,
  getStoredLastEventId,
  setStoredApiKey,
  setStoredLastEventId,
  subscribeStoredApiKey
} from "./storage";

describe("developer storage", () => {
  beforeEach(() => {
    clearStoredApiKey();
    clearStoredLastEventId();
  });

  it("stores and retrieves api key", () => {
    expect(getStoredApiKey()).toBe(null);
    setStoredApiKey("cd_live_123");
    expect(getStoredApiKey()).toBe("cd_live_123");
    clearStoredApiKey();
    expect(getStoredApiKey()).toBe(null);
  });

  it("notifies same-tab subscribers when the api key changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStoredApiKey(listener);

    setStoredApiKey("cd_live_event");
    clearStoredApiKey();
    unsubscribe();
    setStoredApiKey("cd_live_after_unsubscribe");

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stores and retrieves last event id", () => {
    expect(getStoredLastEventId()).toBe(null);
    setStoredLastEventId("10-1");
    expect(getStoredLastEventId()).toBe("10-1");
    clearStoredLastEventId();
    expect(getStoredLastEventId()).toBe(null);
  });
});
