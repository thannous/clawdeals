import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { isWebMCPSupported, registerTools } from "./adapter";

describe("webmcp adapter", () => {
  const originalNavigator = (globalThis as any).navigator;
  const originalDocument = (globalThis as any).document;
  const originalNavDescriptor =
    originalNavigator && typeof originalNavigator === "object"
      ? Object.getOwnPropertyDescriptor(originalNavigator, "modelContext")
      : undefined;
  const originalDocDescriptor =
    originalDocument && typeof originalDocument === "object"
      ? Object.getOwnPropertyDescriptor(originalDocument, "modelContext")
      : undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    const nav = (globalThis as any).navigator;
    if (nav && typeof nav === "object") {
      if (originalNavDescriptor) {
        Object.defineProperty(nav, "modelContext", originalNavDescriptor);
      } else {
        delete (nav as any).modelContext;
      }
    }
    const doc = (globalThis as any).document;
    if (doc && typeof doc === "object") {
      if (originalDocDescriptor) {
        Object.defineProperty(doc, "modelContext", originalDocDescriptor);
      } else {
        delete (doc as any).modelContext;
      }
    }
  });

  it("returns false when modelContext is missing", () => {
    const nav = (globalThis as any).navigator ?? {};
    if (!(globalThis as any).navigator) {
      Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
    }
    delete (nav as any).modelContext;
    const doc = (globalThis as any).document ?? {};
    if (!(globalThis as any).document) {
      Object.defineProperty(globalThis, "document", { value: doc, configurable: true });
    }
    delete (doc as any).modelContext;
    expect(isWebMCPSupported()).toBe(false);
  });

  it("registers tools via document.modelContext.registerTool", async () => {
    const registerTool = vi.fn();
    const doc = (globalThis as any).document ?? {};
    if (!(globalThis as any).document) {
      Object.defineProperty(globalThis, "document", { value: doc, configurable: true });
    }
    Object.defineProperty(doc, "modelContext", {
      value: { registerTool },
      configurable: true
    });

    const result = await registerTools([
      { name: "t1", description: "d1", inputSchema: {}, execute: async () => ({ ok: true }) },
      { name: "t2", description: "d2", inputSchema: {}, execute: async () => ({ ok: true }) }
    ]);

    expect(isWebMCPSupported()).toBe(true);
    expect(result.registered).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.kind).toBe("document.modelContext.registerTool");
    expect(registerTool).toHaveBeenCalledTimes(2);
    expect(registerTool.mock.calls[0][0].name).toBe("t1");
  });

  it("falls back to navigator.modelContext when document has none", async () => {
    const registerTool = vi.fn();
    const doc = (globalThis as any).document ?? {};
    if (!(globalThis as any).document) {
      Object.defineProperty(globalThis, "document", { value: doc, configurable: true });
    }
    delete (doc as any).modelContext;

    const nav = (globalThis as any).navigator ?? {};
    if (!(globalThis as any).navigator) {
      Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
    }
    Object.defineProperty(nav, "modelContext", {
      value: { registerTool },
      configurable: true
    });

    const result = await registerTools([
      { name: "t1", description: "d1", inputSchema: {}, execute: async () => ({ ok: true }) }
    ]);

    expect(result.registered).toBe(1);
    expect(result.kind).toBe("navigator.modelContext.registerTool");
  });
});
