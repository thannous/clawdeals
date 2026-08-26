import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { isWebMCPSupported, registerTools } from "./adapter";

function makeTool(name: string, execute: (args: any, options: { signal: AbortSignal }) => Promise<any> = async () => ({ ok: true })) {
  return { name, description: `d-${name}`, inputSchema: {}, execute };
}

describe("webmcp adapter", () => {
  const originalDocument = (globalThis as any).document;
  const originalDocDescriptor =
    originalDocument && typeof originalDocument === "object"
      ? Object.getOwnPropertyDescriptor(originalDocument, "modelContext")
      : undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    const doc = (globalThis as any).document;
    if (doc && typeof doc === "object") {
      if (originalDocDescriptor) {
        Object.defineProperty(doc, "modelContext", originalDocDescriptor);
      } else {
        delete (doc as any).modelContext;
      }
    }
  });

  it("returns false when document.modelContext is missing", () => {
    const doc = (globalThis as any).document ?? {};
    if (!(globalThis as any).document) {
      Object.defineProperty(globalThis, "document", { value: doc, configurable: true });
    }
    delete (doc as any).modelContext;
    expect(isWebMCPSupported()).toBe(false);
  });

  it("does not fall back to navigator.modelContext", async () => {
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

    expect(isWebMCPSupported()).toBe(false);
    const result = await registerTools([makeTool("t1")]);
    expect(result.registered).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.kind).toBe("none");
    expect(result.registeredToolNames).toEqual([]);
    expect(registerTool).not.toHaveBeenCalled();
    delete (nav as any).modelContext;
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

    const result = await registerTools([makeTool("t1"), makeTool("t2")]);

    expect(isWebMCPSupported()).toBe(true);
    expect(result.registered).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.kind).toBe("document.modelContext.registerTool");
    expect(result.registeredToolNames).toEqual(["t1", "t2"]);
    expect(registerTool).toHaveBeenCalledTimes(2);
    expect(registerTool.mock.calls[0][0].name).toBe("t1");
    expect(registerTool.mock.calls[0]).toHaveLength(2);
  });

  it("passes the official register option signal without wrapping execute", async () => {
    const registerTool = vi.fn();
    const execute = vi.fn(async () => ({ ok: true }));
    const doc = (globalThis as any).document ?? {};
    if (!(globalThis as any).document) {
      Object.defineProperty(globalThis, "document", { value: doc, configurable: true });
    }
    Object.defineProperty(doc, "modelContext", {
      value: { registerTool },
      configurable: true
    });

    const controller = new AbortController();
    await registerTools([makeTool("t1", execute)], { signal: controller.signal });

    expect(registerTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "t1", execute }),
      { signal: controller.signal }
    );
  });

  it("counts a single tool failure as errors=1 without retrying other signatures", async () => {
    const registerTool = vi.fn(() => {
      throw new Error("register failed");
    });
    const doc = (globalThis as any).document ?? {};
    if (!(globalThis as any).document) {
      Object.defineProperty(globalThis, "document", { value: doc, configurable: true });
    }
    Object.defineProperty(doc, "modelContext", {
      value: { registerTool },
      configurable: true
    });

    const result = await registerTools([makeTool("t1")]);

    expect(result.registered).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.kind).toBe("document.modelContext.registerTool");
    expect(result.registeredToolNames).toEqual([]);
    expect(registerTool).toHaveBeenCalledTimes(1);
  });

  it("continues registering remaining tools after one failure", async () => {
    const registerTool = vi.fn((tool: { name: string }) => {
      if (tool.name === "t2") throw new Error("boom");
    });
    const doc = (globalThis as any).document ?? {};
    if (!(globalThis as any).document) {
      Object.defineProperty(globalThis, "document", { value: doc, configurable: true });
    }
    Object.defineProperty(doc, "modelContext", {
      value: { registerTool },
      configurable: true
    });

    const result = await registerTools([makeTool("t1"), makeTool("t2"), makeTool("t3")]);

    expect(result.registered).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.registeredToolNames).toEqual(["t1", "t3"]);
    expect(registerTool).toHaveBeenCalledTimes(3);
    expect(registerTool.mock.calls.map((call) => call[0].name)).toEqual(["t1", "t2", "t3"]);
  });
});
