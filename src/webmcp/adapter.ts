type RegisterToolFn = (...args: any[]) => any;

function getModelContext(): { mc: any; source: "document" | "navigator" } | null {
  if (typeof document !== "undefined" && (document as any).modelContext) {
    return { mc: (document as any).modelContext, source: "document" };
  }
  if (typeof navigator !== "undefined" && (navigator as any).modelContext) {
    return { mc: (navigator as any).modelContext, source: "navigator" };
  }
  return null;
}

function resolveRegisterFn(): { fn: RegisterToolFn | null; kind: string } {
  const resolved = getModelContext();
  if (!resolved) return { fn: null, kind: "none" };

  const mc = resolved.mc;
  if (typeof mc.registerTool === "function") {
    return { fn: mc.registerTool.bind(mc), kind: `${resolved.source}.modelContext.registerTool` };
  }

  const tools = mc.tools;
  if (tools && typeof tools.register === "function") {
    return { fn: tools.register.bind(tools), kind: `${resolved.source}.modelContext.tools.register` };
  }

  return { fn: null, kind: "none" };
}

export function isWebMCPSupported(): boolean {
  return Boolean(resolveRegisterFn().fn);
}

export type WebMcpToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  openWorldHint?: boolean;
};

export type WebMcpRegisterableTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: any, options?: { signal?: AbortSignal }) => Promise<any>;
  annotations?: WebMcpToolAnnotations;
};

export async function registerTools(
  tools: WebMcpRegisterableTool[],
  options?: { signal?: AbortSignal }
): Promise<{ registered: number; errors: number; kind: string }> {
  const resolved = resolveRegisterFn();
  const registerFn = resolved.fn;
  if (!registerFn) return { registered: 0, errors: 0, kind: resolved.kind };

  let registered = 0;
  let errors = 0;
  const registerOptions = options?.signal ? { signal: options.signal } : undefined;

  for (const tool of tools) {
    if (options?.signal?.aborted) break;

    const payload = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      execute: tool.execute
    };

    try {
      const result = registerFn(payload, registerOptions);
      if (result && typeof result.then === "function") await result;
      registered += 1;
      continue;
    } catch {
      // fallthrough to older call shapes
    }

    try {
      const result = registerFn(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations
        },
        tool.execute
      );
      if (result && typeof result.then === "function") await result;
      registered += 1;
      continue;
    } catch {
      // fallthrough
    }

    try {
      const result = registerFn(tool.name, {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        execute: tool.execute
      });
      if (result && typeof result.then === "function") await result;
      registered += 1;
    } catch {
      errors += 1;
    }
  }

  return { registered, errors, kind: resolved.kind };
}
