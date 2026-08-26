const OFFICIAL_KIND = "document.modelContext.registerTool";

export type WebMcpToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  openWorldHint?: boolean;
};

export type WebMcpToolExecuteOptions = {
  signal: AbortSignal;
};

export type WebMcpToolExecuteCallback = (
  args: any,
  options: WebMcpToolExecuteOptions
) => Promise<any>;

type OfficialRegisterTool = (
  tool: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations?: WebMcpToolAnnotations;
    execute: WebMcpToolExecuteCallback;
  },
  options?: { signal?: AbortSignal }
) => Promise<undefined>;

function getDocumentRegisterTool(): OfficialRegisterTool | null {
  if (typeof document === "undefined") return null;
  const mc = (document as Document & { modelContext?: { registerTool?: unknown } }).modelContext;
  if (!mc || typeof mc.registerTool !== "function") return null;
  return mc.registerTool.bind(mc) as OfficialRegisterTool;
}

export function isWebMCPSupported(): boolean {
  return Boolean(getDocumentRegisterTool());
}

export type WebMcpRegisterableTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: WebMcpToolExecuteCallback;
  annotations?: WebMcpToolAnnotations;
};

export async function registerTools(
  tools: WebMcpRegisterableTool[],
  options?: { signal?: AbortSignal }
): Promise<{ registered: number; errors: number; kind: string }> {
  const registerTool = getDocumentRegisterTool();
  if (!registerTool) return { registered: 0, errors: 0, kind: "none" };

  let registered = 0;
  let errors = 0;
  const registerOptions = options?.signal ? { signal: options.signal } : undefined;

  for (const tool of tools) {
    if (options?.signal?.aborted) break;

    try {
      await registerTool(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          execute: tool.execute
        },
        registerOptions
      );
      registered += 1;
    } catch {
      errors += 1;
    }
  }

  return { registered, errors, kind: OFFICIAL_KIND };
}
