import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { isWebMCPSupported, registerTools } from "./adapter";

describe("webmcp adapter", () => {
  const originalNavigator = (globalThis as any).navigator;
  const originalModelContextDescriptor =
    originalNavigator && typeof originalNavigator === "object"
      ? Object.getOwnPropertyDescriptor(originalNavigator, "modelContext")
      : undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    const nav = (globalThis as any).navigator;
    if (!nav || typeof nav !== "object") return;

    // In jsdom, `globalThis.navigator` is typically a getter-only property, so avoid reassigning it.
    // Restore only what we mutate on the navigator object itself.
    if (originalModelContextDescriptor) {
      Object.defineProperty(nav, "modelContext", originalModelContextDescriptor);
    } else {
      delete (nav as any).modelContext;
    }
  });

  it("returns false when navigator.modelContext is missing", () => {
    const nav = (globalThis as any).navigator ?? {};
    // Ensure `navigator` exists even in non-jsdom envs.
    if (!(globalThis as any).navigator) {
      Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
    }

    delete (nav as any).modelContext;
    expect(isWebMCPSupported()).toBe(false);
  });

  it("registers tools via modelContext.registerTool when available", () => {
    const registerTool = vi.fn();
    const nav = (globalThis as any).navigator ?? {};
    if (!(globalThis as any).navigator) {
      Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
    }

    Object.defineProperty(nav, "modelContext", {
      value: { registerTool },
      configurable: true
    });

    const result = registerTools([
      { name: "t1", description: "d1", inputSchema: {}, execute: async () => ({ ok: true }) },
      { name: "t2", description: "d2", inputSchema: {}, execute: async () => ({ ok: true }) }
    ]);

    expect(isWebMCPSupported()).toBe(true);
    expect(result.registered).toBe(2);
    expect(result.errors).toBe(0);
    expect(registerTool).toHaveBeenCalledTimes(2);
  });
});
