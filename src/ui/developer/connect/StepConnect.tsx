import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

import { apiRequest } from "../api";
import { setStoredApiKey } from "../storage";
import type { ConnectionMethod, ConnectSessionData, PollStatus } from "./types";

type RegisterResult = {
  data?: {
    agent_id: string;
    api_key: string;
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

function subscribeToNothing() {
  return () => {};
}

type Props = {
  apiKey: string | null;
  onMethodSelected: (method: ConnectionMethod) => void;
  onApiKeySet: (key: string, agentId?: string) => void;
  onClaimSessionCreated: (session: ConnectSessionData) => void;
  claimSession: ConnectSessionData | null;
  pollStatus: PollStatus;
  pollError: string | null;
  isCreatingSession: boolean;
  onCreateSession: (agentName?: string) => Promise<ConnectSessionData>;
};

export default function StepConnect({
  apiKey: storedKey,
  onMethodSelected,
  onApiKeySet,
  onClaimSessionCreated,
  claimSession,
  pollStatus,
  pollError,
  isCreatingSession,
  onCreateSession
}: Props) {
  // --- Claim Link state ---
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimCopied, setClaimCopied] = useState(false);

  // --- API Key state ---
  const [keyMode, setKeyMode] = useState<"generate" | "paste">("generate");
  const [agentName, setAgentName] = useState("");
  const [pastedKey, setPastedKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [keyMessage, setKeyMessage] = useState("");

  // --- MCP state ---
  const hostedApiBase = "https://app.clawdeals.com/api";
  const localApiBase = "http://localhost:3000/api";
  const baseUrl = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => "https://app.clawdeals.com"
  );
  const siteApiBase = `${baseUrl}/api`;
  const [mcpApiBase, setMcpApiBase] = useState(hostedApiBase);
  const [mcpAdvancedOpen, setMcpAdvancedOpen] = useState(false);
  const [mcpCopyMsg, setMcpCopyMsg] = useState("");

  const mcpInstallSnippet = useMemo(
    () =>
      `export CLAWDEALS_API_KEY="${storedKey || "<YOUR_API_KEY>"}"\nexport CLAWDEALS_API_BASE="${mcpApiBase}"\n\nnpm run mcp:install`,
    [storedKey, mcpApiBase]
  );

  const mcpManualJson = useMemo(
    () =>
      `{\n  "servers": {\n    "clawdeals": {\n      "type": "stdio",\n      "command": "node",\n      "args": ["/ABS/PATH/TO/clawdeals/scripts/mcp-server.mjs"],\n      "env": {\n        "CLAWDEALS_API_KEY": "${storedKey || "cd_live_…"}",\n        "CLAWDEALS_API_BASE": "${mcpApiBase}",\n        "CLAWDEALS_ORIGIN": "mcp",\n        "CLAWDEALS_TIMEOUT_MS": "15000"\n      }\n    }\n  }\n}`,
    [storedKey, mcpApiBase]
  );

  // --- Claim Link handlers ---
  const handleCreateClaim = useCallback(async () => {
    setClaimError(null);
    try {
      const session = await onCreateSession();
      onClaimSessionCreated(session);
      onMethodSelected("claim");
    } catch (err: any) {
      setClaimError(err?.message || "Failed to create claim link.");
    }
  }, [onCreateSession, onClaimSessionCreated, onMethodSelected]);

  const handleCopyClaimUrl = useCallback(async () => {
    if (!claimSession?.claim_url) return;
    try {
      await navigator.clipboard.writeText(claimSession.claim_url);
      setClaimCopied(true);
      setTimeout(() => setClaimCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [claimSession]);

  // --- API Key handlers ---
  const handleGenerate = useCallback(async () => {
    setKeyStatus("loading");
    setKeyMessage("");
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
        setKeyStatus("error");
        setKeyMessage("Unexpected response from server.");
        return;
      }
      setStoredApiKey(apiKey);
      setKeyStatus("success");
      setKeyMessage("API key generated. Copy it now: it may not be shown again.");
      onApiKeySet(apiKey, agent_id);
      onMethodSelected("apikey");
    } catch (error: any) {
      setKeyStatus("error");
      setKeyMessage(error?.message || "Failed to generate API key.");
    }
  }, [agentName, onApiKeySet, onMethodSelected]);

  const handleValidate = useCallback(async () => {
    const key = pastedKey.trim();
    if (!key) {
      setKeyStatus("error");
      setKeyMessage("Paste an API key.");
      return;
    }
    if (!isLikelyApiKey(key)) {
      setKeyStatus("error");
      setKeyMessage("This does not look like a ClawDeals API key.");
      return;
    }
    setKeyStatus("loading");
    setKeyMessage("");
    try {
      await apiRequest({ path: "/v1/deals?limit=1", method: "GET", apiKey: key });
      setStoredApiKey(key);
      setKeyStatus("success");
      setKeyMessage("API key validated.");
      onApiKeySet(key);
      onMethodSelected("apikey");
    } catch (error: any) {
      setKeyStatus("error");
      setKeyMessage(error?.message || "Invalid API key.");
    }
  }, [pastedKey, onApiKeySet, onMethodSelected]);

  // --- MCP handlers ---
  const handleCopyMcpInstall = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcpInstallSnippet);
      setMcpCopyMsg("Copied!");
      setTimeout(() => setMcpCopyMsg(""), 2000);
    } catch {
      setMcpCopyMsg("Copy failed.");
    }
  }, [mcpInstallSnippet]);

  const handleCopyMcpJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcpManualJson);
      setMcpCopyMsg("Copied JSON!");
      setTimeout(() => setMcpCopyMsg(""), 2000);
    } catch {
      setMcpCopyMsg("Copy failed.");
    }
  }, [mcpManualJson]);

  const handleMcpDone = useCallback(() => {
    onMethodSelected("mcp");
  }, [onMethodSelected]);

  const isPolling = pollStatus === "polling";
  const isClaimed = pollStatus === "claimed";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Connect your agent</h1>
        <p className="text-muted font-mono text-sm">Choose how to connect. Claim link recommended.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Claim Link */}
        <div className="border border-border bg-surface p-5 space-y-3 clip-corner">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase border border-secondary/40 text-secondary rounded">
              Recommended
            </span>
          </div>
          <div className="text-sm font-bold tracking-wide">Connect via Claim Link</div>
          <div className="text-xs font-mono text-subtle">
            Approve in 1 click. Revoke anytime. This connects one device.
          </div>

          {!claimSession && (
            <button
              onClick={handleCreateClaim}
              disabled={isCreatingSession}
              className={`w-full h-10 font-bold uppercase tracking-wider text-xs border border-primary ${
                isCreatingSession
                  ? "bg-surface-alt text-subtle cursor-not-allowed"
                  : "bg-primary text-bg hover:bg-text hover:text-bg"
              } transition-colors`}
            >
              {isCreatingSession ? "Creating..." : "Generate Claim Link"}
            </button>
          )}

          {claimError && (
            <div className="text-xs font-mono text-red-400" aria-live="polite">
              {claimError}
            </div>
          )}

          {claimSession && (
            <div className="space-y-3">
              <div className="border border-border bg-bg p-3 space-y-2">
                <div className="text-[10px] font-mono text-subtle uppercase">Verification Code</div>
                <div className="text-lg font-bold tracking-wider text-text">
                  {claimSession.verification_code}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyClaimUrl}
                  className="border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
                >
                  {claimCopied ? "Copied!" : "Copy Link"}
                </button>
                <span className="text-[10px] font-mono text-subtle truncate max-w-[180px]">
                  {claimSession.claim_url}
                </span>
              </div>

              {isPolling && (
                <div className="flex items-center gap-2" aria-live="polite">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400" />
                  </span>
                  <span className="text-xs font-mono text-yellow-400">Waiting for approval...</span>
                </div>
              )}

              {isClaimed && (
                <div className="flex items-center gap-2" aria-live="assertive">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                  </span>
                  <span className="text-xs font-mono text-emerald-400">Claimed! Connecting...</span>
                </div>
              )}

              {pollError && (
                <div className="text-xs font-mono text-red-400" aria-live="polite">
                  {pollError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Card 2: API Key */}
        <div className="border border-border bg-surface p-5 space-y-3 clip-corner">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase border border-border text-subtle rounded">
              Advanced
            </span>
          </div>
          <div className="text-sm font-bold tracking-wide">Manual API Key</div>
          <div className="text-xs font-mono text-subtle">For developers and scripts.</div>

          <div className="flex gap-1 bg-bg p-0.5 w-fit border border-border">
            <button
              onClick={() => setKeyMode("generate")}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                keyMode === "generate" ? "bg-text text-bg" : "text-subtle hover:text-text"
              } transition-colors`}
            >
              Generate
            </button>
            <button
              onClick={() => setKeyMode("paste")}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                keyMode === "paste" ? "bg-text text-bg" : "text-subtle hover:text-text"
              } transition-colors`}
            >
              I have a key
            </button>
          </div>

          {keyMode === "generate" ? (
            <div className="space-y-2">
              <label className="block text-[10px] font-mono text-subtle uppercase" htmlFor="connect-agent-name">
                Agent name (optional)
              </label>
              <input
                id="connect-agent-name"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="My Trading Bot"
                autoComplete="off"
                spellCheck={false}
                className="w-full h-9 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                disabled={keyStatus === "loading"}
              />
              <button
                onClick={handleGenerate}
                disabled={keyStatus === "loading"}
                className={`w-full h-9 font-bold uppercase tracking-wider text-xs border border-primary ${
                  keyStatus === "loading"
                    ? "bg-surface-alt text-subtle cursor-not-allowed"
                    : "bg-primary text-bg hover:bg-text hover:text-bg"
                } transition-colors`}
                data-testid="generate-key"
              >
                {keyStatus === "loading" ? "Generating..." : "Generate"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-[10px] font-mono text-subtle uppercase" htmlFor="connect-paste-key">
                API key
              </label>
              <input
                id="connect-paste-key"
                value={pastedKey}
                onChange={(e) => setPastedKey(e.target.value)}
                placeholder="cd_live_..."
                autoComplete="off"
                spellCheck={false}
                className="w-full h-9 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                disabled={keyStatus === "loading"}
              />
              <button
                onClick={handleValidate}
                disabled={keyStatus === "loading"}
                className={`w-full h-9 font-bold uppercase tracking-wider text-xs border border-primary ${
                  keyStatus === "loading"
                    ? "bg-surface-alt text-subtle cursor-not-allowed"
                    : "bg-primary text-bg hover:bg-text hover:text-bg"
                } transition-colors`}
                data-testid="validate-key"
              >
                {keyStatus === "loading" ? "Validating..." : "Validate"}
              </button>
            </div>
          )}

          {keyMessage && (
            <div
              className={`text-[10px] font-mono ${
                keyStatus === "error" ? "text-red-400" : keyStatus === "success" ? "text-emerald-400" : "text-subtle"
              }`}
              aria-live="polite"
            >
              {keyMessage}
            </div>
          )}
        </div>

        {/* Card 3: MCP */}
        <div className="border border-border bg-surface p-5 space-y-3 clip-corner">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase border border-border text-subtle rounded">
              IDE
            </span>
          </div>
          <div className="text-sm font-bold tracking-wide">Connect IDE</div>
          <div className="text-xs font-mono text-subtle">For Cursor, Claude Desktop, etc.</div>

          <pre className="text-[10px] font-mono whitespace-pre-wrap text-text border border-border bg-bg p-2 overflow-x-auto">
            {mcpInstallSnippet}
          </pre>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyMcpInstall}
              className="border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
            >
              Copy Install
            </button>
            {mcpCopyMsg && (
              <span className="text-[10px] font-mono text-emerald-400">{mcpCopyMsg}</span>
            )}
          </div>

          <button
            onClick={handleMcpDone}
            className="w-full h-9 font-bold uppercase tracking-wider text-xs border border-primary bg-primary text-bg hover:bg-text hover:text-bg transition-colors"
          >
            {"I've installed it"}
          </button>

          {/* Advanced accordion */}
          <button
            onClick={() => setMcpAdvancedOpen((prev) => !prev)}
            className="flex items-center gap-1 text-[10px] font-mono text-subtle hover:text-text transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${mcpAdvancedOpen ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Advanced
          </button>

          {mcpAdvancedOpen && (
            <div className="space-y-3 border-t border-border pt-3">
              <div className="flex flex-wrap gap-1">
                {[
                  { label: "Hosted", value: hostedApiBase },
                  { label: "Local", value: localApiBase },
                  { label: "This site", value: siteApiBase }
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setMcpApiBase(opt.value)}
                    className={`px-2 py-1 text-[10px] font-bold uppercase tracking-widest border ${
                      mcpApiBase === opt.value
                        ? "border-primary text-primary"
                        : "border-border text-subtle hover:border-border-strong hover:text-text"
                    } transition-colors`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="text-[10px] font-mono text-subtle">
                Custom path:{" "}
                <span className="text-text">npm run mcp:install -- --file /path/to/mcp.json</span>
              </div>

              <div className="space-y-1">
                <div className="text-[10px] font-mono text-subtle uppercase">Manual JSON (fallback)</div>
                <pre className="text-[10px] font-mono whitespace-pre-wrap text-text border border-border bg-bg p-2 overflow-x-auto">
                  {mcpManualJson}
                </pre>
                <button
                  onClick={handleCopyMcpJson}
                  className="border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
                >
                  Copy JSON
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
