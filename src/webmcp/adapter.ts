const OFFICIAL_KIND = "document.modelContext.registerTool";

export type WebMcpToolAnnotations = {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
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

export type BrowserReportedTool = {
  name: string;
  description: string;
  origin: string | null;
  annotations: WebMcpToolAnnotations | null;
};

type ModelContextDiscovery = {
  getTools?: (options?: { fromOrigins?: string[] }) => Promise<unknown>;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

function getModelContextDiscovery(): ModelContextDiscovery | null {
  if (typeof document === "undefined") return null;
  const mc = (document as Document & { modelContext?: unknown }).modelContext;
  if (!mc || typeof mc !== "object") return null;
  return mc as ModelContextDiscovery;
}

/** `document.modelContext.getTools()` shipped after `registerTool`; older runtimes expose only the latter. */
export function isBrowserToolDiscoverySupported(): boolean {
  return typeof getModelContextDiscovery()?.getTools === "function";
}

/**
 * Reads the registry as the browser itself reports it (alphabetical, same-origin only).
 * Returns `null` when the runtime has no `getTools()` so callers never mistake "unknown" for "empty".
 */
export async function getBrowserReportedTools(): Promise<BrowserReportedTool[] | null> {
  const mc = getModelContextDiscovery();
  if (!mc || typeof mc.getTools !== "function") return null;
  const raw = await mc.getTools();
  if (!Array.isArray(raw)) return [];
  const tools: BrowserReportedTool[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.name !== "string" || !candidate.name) continue;
    tools.push({
      name: candidate.name,
      description: typeof candidate.description === "string" ? candidate.description : "",
      origin: typeof candidate.origin === "string" ? candidate.origin : null,
      annotations:
        candidate.annotations && typeof candidate.annotations === "object"
          ? (candidate.annotations as WebMcpToolAnnotations)
          : null
    });
  }
  return tools.sort((a, b) => a.name.localeCompare(b.name));
}

/** Subscribes to the browser's `toolchange` event; a no-op unsubscribe is returned when unsupported. */
export function subscribeBrowserToolChange(listener: () => void): () => void {
  const mc = getModelContextDiscovery();
  if (!mc || typeof mc.addEventListener !== "function") return () => undefined;
  mc.addEventListener("toolchange", listener);
  return () => {
    if (typeof mc.removeEventListener === "function") mc.removeEventListener("toolchange", listener);
  };
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
): Promise<{ registered: number; errors: number; kind: string; registeredToolNames: string[] }> {
  const registerTool = getDocumentRegisterTool();
  if (!registerTool) return { registered: 0, errors: 0, kind: "none", registeredToolNames: [] };

  let registered = 0;
  let errors = 0;
  const registeredToolNames: string[] = [];
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
      registeredToolNames.push(tool.name);
    } catch {
      errors += 1;
    }
  }

  return { registered, errors, kind: OFFICIAL_KIND, registeredToolNames };
}
