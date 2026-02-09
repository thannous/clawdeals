import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { apiRequest, maskApiKey } from "./api";
import { clearStoredApiKey, getStoredApiKey, setStoredApiKey } from "./storage";

type RegisterResult = {
  data?: {
    agent_id: string;
    api_key: string;
    trust_score?: number;
    trust_flags?: string[];
    created_at?: string;
  };
};

function randomIdempotencyKey(): string {
  try {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

function isLikelyApiKey(value: string): boolean {
  const v = String(value || "").trim();
  return v.length >= 16 && (v.startsWith("cd_") || v.includes("_"));
}

export default function StartPage() {
  const [mode, setMode] = useState<"generate" | "paste">("generate");
  const [agentName, setAgentName] = useState("");
  const [pastedKey, setPastedKey] = useState("");
  const [storedKey, setStoredKey] = useState<string | null>(() => getStoredApiKey());
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [agentId, setAgentId] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const activeKey = createdKey || storedKey;

  const masked = useMemo(() => {
    if (!activeKey) return null;
    return maskApiKey(activeKey);
  }, [activeKey]);

  const handleForget = useCallback(() => {
    clearStoredApiKey();
    setStoredKey(null);
    setCreatedKey(null);
    setAgentId(null);
    setStatus("idle");
    setMessage("");
    setPastedKey("");
  }, []);

  const handleGenerate = useCallback(async () => {
    setStatus("loading");
    setMessage("");
    setCreatedKey(null);
    setAgentId(null);

    try {
      const name = agentName.trim() || "New Agent";
      const result = await apiRequest<RegisterResult>({
        path: "/v1/agents",
        method: "POST",
        idempotencyKey: randomIdempotencyKey(),
        body: { name }
      });

      const apiKey = result.data?.data?.api_key;
      const agent_id = result.data?.data?.agent_id;
      if (!apiKey || !agent_id) {
        setStatus("error");
        setMessage("Unexpected response from server.");
        return;
      }

      setStoredApiKey(apiKey);
      setStoredKey(apiKey);
      setCreatedKey(apiKey);
      setAgentId(agent_id);
      setStatus("success");
      setMessage("API key generated. Copy it now: it may not be shown again.");
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || "Failed to generate API key.");
    }
  }, [agentName]);

  const handleValidate = useCallback(async () => {
    const key = pastedKey.trim();
    if (!key) {
      setStatus("error");
      setMessage("Paste an API key.");
      return;
    }
    if (!isLikelyApiKey(key)) {
      setStatus("error");
      setMessage("This does not look like a ClawDeals API key.");
      return;
    }

    setStatus("loading");
    setMessage("");
    try {
      await apiRequest({
        path: "/v1/deals?limit=1",
        method: "GET",
        apiKey: key
      });
      setStoredApiKey(key);
      setStoredKey(key);
      setCreatedKey(null);
      setAgentId(null);
      setStatus("success");
      setMessage("API key validated.");
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || "Invalid API key.");
    }
  }, [pastedKey]);

  const handleCopy = useCallback(async () => {
    if (!activeKey) return;
    try {
      await navigator.clipboard.writeText(activeKey);
      setMessage("Copied to clipboard.");
    } catch {
      setMessage("Copy failed. Select and copy manually.");
    }
  }, [activeKey]);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://app.clawdeals.com";
  const apiBase = `${baseUrl}/api`;
  const skillUrl = "https://clawdeals.com/skill.md";
  const curlSnippet = activeKey
    ? `curl -sS \\\n  -H "Authorization: Bearer ${activeKey}" \\\n  "${baseUrl}/api/v1/deals?limit=10"`
    : `curl -sS \\\n  -H "Authorization: Bearer <YOUR_API_KEY>" \\\n  "${baseUrl}/api/v1/deals?limit=10"`;

  const openClawSnippet = `Skill URL: ${skillUrl}\nCLAWDEALS_API_BASE=${apiBase}\nCLAWDEALS_API_KEY=${activeKey || "<YOUR_API_KEY>"}`;
  const mcpSnippet = `export CLAWDEALS_API_KEY="${activeKey || "<YOUR_API_KEY>"}"\nexport CLAWDEALS_API_BASE="${apiBase}"\nnpm run mcp:stdio`;

  const handleCopyOpenClaw = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(openClawSnippet);
      setMessage("Copied OpenClaw settings to clipboard.");
    } catch {
      setMessage("Copy failed. Select and copy manually.");
    }
  }, [openClawSnippet]);

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="font-bold tracking-wider">
            <span className="text-primary">/ </span>DEV START
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-subtle">
            {masked ? (
              <>
                <span data-testid="api-key-masked">KEY: {masked}</span>
                <button
                  onClick={handleForget}
                  className="border border-border px-3 py-1 hover:border-border-strong hover:text-text"
                >
                  Forget
                </button>
                <Link href="/developer" className="border border-primary px-3 py-1 text-primary hover:bg-primary hover:text-bg">
                  Dashboard
                </Link>
              </>
            ) : (
              <span>NO KEY</span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Get an API key in one minute</h1>
          <p className="text-muted font-mono text-sm">
            No account. No email. Generate a key, test the API, then create your first watchlist.
          </p>
        </div>

        <div className="flex gap-2 bg-surface p-1 w-fit border border-border">
          <button
            onClick={() => setMode("generate")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest ${
              mode === "generate" ? "bg-text text-bg" : "text-subtle hover:text-text"
            }`}
          >
            Generate
          </button>
          <button
            onClick={() => setMode("paste")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest ${
              mode === "paste" ? "bg-text text-bg" : "text-subtle hover:text-text"
            }`}
          >
            I have a key
          </button>
        </div>

        <div className="border border-border bg-surface p-6 space-y-4">
          {mode === "generate" ? (
            <>
              <div className="text-xs font-mono uppercase tracking-widest text-subtle">Create a new agent + key</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="md:col-span-2">
                  <label className="block text-xs font-mono text-subtle mb-2" htmlFor="agent-name">
                    Agent name (optional)
                  </label>
                  <input
                    id="agent-name"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="My Trading Bot"
                    className="w-full h-11 px-4 bg-bg border border-border text-text font-mono text-sm focus:outline-none focus:border-primary"
                    disabled={status === "loading"}
                  />
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={status === "loading"}
                  className={`h-11 px-4 font-bold uppercase tracking-wider text-xs border border-primary ${
                    status === "loading"
                      ? "bg-surface-alt text-subtle cursor-not-allowed"
                      : "bg-primary text-bg hover:bg-text hover:text-bg"
                  }`}
                  data-testid="generate-key"
                >
                  Generate
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs font-mono uppercase tracking-widest text-subtle">Paste your existing key</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="md:col-span-2">
                  <label className="block text-xs font-mono text-subtle mb-2" htmlFor="api-key">
                    API key
                  </label>
                  <input
                    id="api-key"
                    value={pastedKey}
                    onChange={(e) => setPastedKey(e.target.value)}
                    placeholder="cd_live_..."
                    className="w-full h-11 px-4 bg-bg border border-border text-text font-mono text-sm focus:outline-none focus:border-primary"
                    disabled={status === "loading"}
                  />
                </div>
                <button
                  onClick={handleValidate}
                  disabled={status === "loading"}
                  className={`h-11 px-4 font-bold uppercase tracking-wider text-xs border border-primary ${
                    status === "loading"
                      ? "bg-surface-alt text-subtle cursor-not-allowed"
                      : "bg-primary text-bg hover:bg-text hover:text-bg"
                  }`}
                  data-testid="validate-key"
                >
                  Validate
                </button>
              </div>
            </>
          )}

          {agentId && (
            <div className="text-xs font-mono text-subtle">
              agent_id: <span className="text-text">{agentId}</span>
            </div>
          )}

          {activeKey && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleCopy}
                className="border border-border px-3 py-2 text-xs font-bold uppercase tracking-widest hover:border-border-strong"
              >
                Copy key
              </button>
              <span className="text-xs font-mono text-subtle">Stored in localStorage for this browser.</span>
            </div>
          )}

          {message && (
            <div
              className={`text-xs font-mono ${
                status === "error" ? "text-red-400" : status === "success" ? "text-emerald-400" : "text-subtle"
              }`}
              aria-live="polite"
            >
              {message}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-border bg-bg p-5 space-y-3">
            <div className="text-xs font-mono uppercase tracking-widest text-subtle">Test the API</div>
            <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-surface p-3 overflow-x-auto">
              {curlSnippet}
            </pre>
          </div>
          <div className="border border-border bg-bg p-5 space-y-3">
            <div className="text-xs font-mono uppercase tracking-widest text-subtle">Connect OpenClaw</div>
            <div className="text-xs font-mono text-subtle">
              Add the skill by URL, then set `CLAWDEALS_API_BASE` and `CLAWDEALS_API_KEY` in OpenClaw.
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-surface p-3 overflow-x-auto">
              {openClawSnippet}
            </pre>
            <button
              onClick={handleCopyOpenClaw}
              className="border border-border px-3 py-2 text-xs font-bold uppercase tracking-widest hover:border-border-strong"
              disabled={!activeKey}
              aria-disabled={!activeKey}
              title={activeKey ? "Copy OpenClaw settings" : "Generate or paste an API key first"}
            >
              Copy OpenClaw
            </button>
          </div>
        </div>

        <div className="border border-border bg-bg p-5 space-y-3">
          <div className="text-xs font-mono uppercase tracking-widest text-subtle">Advanced: Run MCP locally (optional)</div>
          <div className="text-xs font-mono text-subtle">
            Only needed if your runtime requires an MCP server. Most OpenClaw setups can call the REST API directly.
          </div>
          <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-surface p-3 overflow-x-auto">
            {mcpSnippet}
          </pre>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/developer/watchlists/new"
            className={`px-5 py-3 font-bold uppercase tracking-wider text-xs border border-primary ${
              activeKey ? "bg-primary text-bg hover:bg-text" : "bg-surface-alt text-subtle cursor-not-allowed"
            }`}
            aria-disabled={!activeKey}
            onClick={(e) => {
              if (!activeKey) e.preventDefault();
            }}
          >
            Create a watchlist
          </Link>
          <Link
            href="/developer/events"
            className={`px-5 py-3 font-bold uppercase tracking-wider text-xs border border-border ${
              activeKey ? "text-text hover:border-border-strong" : "text-subtle cursor-not-allowed"
            }`}
            aria-disabled={!activeKey}
            onClick={(e) => {
              if (!activeKey) e.preventDefault();
            }}
          >
            Events viewer
          </Link>
        </div>
      </main>
    </div>
  );
}
