type RegisterToolFn = (...args: any[]) => any;

function resolveRegisterFn(): { fn: RegisterToolFn | null; kind: string } {
  const mc: any = typeof navigator !== "undefined" ? (navigator as any).modelContext : null;
  if (!mc) return { fn: null, kind: "none" };

  if (typeof mc.registerTool === "function") {
    return { fn: mc.registerTool.bind(mc), kind: "modelContext.registerTool" };
  }

  const tools = mc.tools;
  if (tools && typeof tools.register === "function") {
    return { fn: tools.register.bind(tools), kind: "modelContext.tools.register" };
  }

  return { fn: null, kind: "none" };
}

export function isWebMCPSupported(): boolean {
  return Boolean(resolveRegisterFn().fn);
}

export type WebMcpRegisterableTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: any) => Promise<any>;
};

export function registerTools(tools: WebMcpRegisterableTool[]): { registered: number; errors: number } {
  const resolved = resolveRegisterFn();
  const registerFn = resolved.fn;
  if (!registerFn) return { registered: 0, errors: 0 };

  let registered = 0;
  let errors = 0;

  for (const tool of tools) {
    try {
      // The WebMCP API is still evolving; support a few plausible call signatures.
      // 1) registerTool({ name, description, inputSchema, execute })
      registerFn({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: tool.execute
      });
      registered += 1;
      continue;
    } catch {
      // fallthrough
    }

    try {
      // 2) registerTool(name, { description, inputSchema }, execute)
      registerFn(
        tool.name,
        { description: tool.description, inputSchema: tool.inputSchema },
        tool.execute
      );
      registered += 1;
      continue;
    } catch {
      // fallthrough
    }

    try {
      // 3) registerTool(name, { description, inputSchema, execute })
      registerFn(tool.name, {
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: tool.execute
      });
      registered += 1;
      continue;
    } catch {
      errors += 1;
    }
  }

  return { registered, errors };
}

