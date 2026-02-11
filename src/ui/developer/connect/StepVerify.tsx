import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest, maskApiKey } from "../api";
import type { AgentMeResponse, ConnectionMethod, ConnectSessionData, ExchangeResult, PollStatus } from "./types";

type Props = {
  method: ConnectionMethod;
  apiKey: string | null;
  claimSession: ConnectSessionData | null;
  pollStatus: PollStatus;
  pollError: string | null;
  onVerified: (agentMe: AgentMeResponse | null) => void;
  onApiKeySet: (key: string, agentId?: string) => void;
  onExchangeForApiKey: (session: ConnectSessionData) => Promise<ExchangeResult>;
  onBack: () => void;
};

export default function StepVerify({
  method,
  apiKey,
  claimSession,
  pollStatus,
  pollError,
  onVerified,
  onApiKeySet,
  onExchangeForApiKey,
  onBack
}: Props) {
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "loading" | "done" | "error">(
    () => (method === "apikey" && apiKey ? "loading" : "idle")
  );
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [agentMe, setAgentMe] = useState<AgentMeResponse | null>(null);
  const [exchangeStatus, setExchangeStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  // MCP verify state
  const [mcpPastedKey, setMcpPastedKey] = useState("");

  const mcpVerifyPrompt = `List tools, then call:\nclawdeals.deals.list { "limit": 1 }`;
  const [mcpCopied, setMcpCopied] = useState(false);

  const verifyStartedRef = useRef(false);
  const exchangeStartedRef = useRef(false);

  // Auto-verify for API Key method
  useEffect(() => {
    if (method !== "apikey" || !apiKey || verifyStartedRef.current) return;
    verifyStartedRef.current = true;

    let cancelled = false;

    apiRequest<{ data: AgentMeResponse }>({
      path: "/v1/agents/me",
      method: "GET",
      apiKey
    })
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        if (data?.agent_id) {
          setAgentMe(data);
          setVerifyStatus("done");
          onVerified(data);
        } else {
          setVerifyStatus("error");
          setVerifyError("Could not verify agent identity.");
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setVerifyStatus("error");
        setVerifyError(err?.message || "Verification failed.");
      });

    return () => {
      cancelled = true;
    };
  }, [method, apiKey, onVerified]);

  // Auto-exchange when claim is successful
  useEffect(() => {
    if (method !== "claim" || pollStatus !== "claimed" || !claimSession || exchangeStartedRef.current) return;
    exchangeStartedRef.current = true;

    let cancelled = false;

    onExchangeForApiKey(claimSession)
      .then((result) => {
        if (cancelled) return;
        setExchangeStatus("done");
        onApiKeySet(result.api_key, result.agent_id);

        const me: AgentMeResponse = {
          agent_id: result.agent_id,
          owner_id: null,
          installation_id: result.installation_id,
          oauth_scopes: ["agent:read", "agent:write"]
        };
        setAgentMe(me);
        onVerified(me);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setExchangeStatus("error");
        setExchangeError(err?.message || "Exchange failed.");
      });

    return () => {
      cancelled = true;
    };
  }, [method, pollStatus, claimSession, onExchangeForApiKey, onApiKeySet, onVerified]);

  // MCP manual verify
  const handleMcpVerify = useCallback(async () => {
    const key = mcpPastedKey.trim() || apiKey;
    if (!key) {
      setVerifyError("Paste your API key to verify.");
      setVerifyStatus("error");
      return;
    }

    setVerifyStatus("loading");
    setVerifyError(null);

    try {
      const res = await apiRequest<{ data: AgentMeResponse }>({
        path: "/v1/agents/me",
        method: "GET",
        apiKey: key
      });
      const data = res.data?.data;
      if (data?.agent_id) {
        setAgentMe(data);
        setVerifyStatus("done");
        onApiKeySet(key, data.agent_id);
        onVerified(data);
      } else {
        setVerifyStatus("error");
        setVerifyError("Could not verify agent identity.");
      }
    } catch (err: any) {
      setVerifyStatus("error");
      setVerifyError(err?.message || "Verification failed.");
    }
  }, [mcpPastedKey, apiKey, onApiKeySet, onVerified]);

  const handleCopyVerifyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcpVerifyPrompt);
      setMcpCopied(true);
      setTimeout(() => setMcpCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [mcpVerifyPrompt]);

  const masked = apiKey ? maskApiKey(apiKey) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight">Verify connection</h2>
          <p className="text-xs font-mono text-subtle">
            {method === "claim" && "Waiting for claim approval..."}
            {method === "apikey" && "Checking your API key..."}
            {method === "mcp" && "Verify your MCP installation."}
          </p>
        </div>
        <button
          onClick={onBack}
          className="px-3 py-1.5 text-xs font-mono text-subtle border border-border rounded hover:border-border-strong hover:text-text transition-colors"
        >
          Back
        </button>
      </div>

      {/* Claim Link verify */}
      {method === "claim" && (
        <div className="border border-border bg-surface p-5 space-y-4 clip-corner">
          {claimSession && (pollStatus === "polling" || pollStatus === "idle") && (
            <>
              <div className="border border-border bg-bg p-4 space-y-2 text-center">
                <div className="text-[10px] font-mono text-subtle uppercase">Verification Code</div>
                <div className="text-2xl font-bold tracking-widest text-text">
                  {claimSession.verification_code}
                </div>
                <div className="text-[10px] font-mono text-subtle">
                  Open the claim link and approve this code.
                </div>
              </div>

              <div className="flex items-center justify-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400" />
                </span>
                <span className="text-xs font-mono text-yellow-400">Waiting for approval...</span>
              </div>

              <div className="text-[10px] font-mono text-muted text-center">
                Share this link with the account owner:{" "}
                <span className="text-text break-all">{claimSession.claim_url}</span>
              </div>
            </>
          )}

          {pollStatus === "claimed" && exchangeStatus === "loading" && (
            <div className="flex items-center justify-center gap-2 py-6">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
              </span>
              <span className="text-xs font-mono text-emerald-400">Claimed! Exchanging credentials...</span>
            </div>
          )}

          {exchangeError && (
            <div className="border border-red-400/30 bg-red-400/5 p-3 clip-corner">
              <div className="text-xs font-mono text-red-400">{exchangeError}</div>
              <button
                onClick={onBack}
                className="mt-2 px-3 py-1.5 text-xs font-mono text-subtle border border-border rounded hover:border-border-strong hover:text-text transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {pollError && (
            <div className="border border-red-400/30 bg-red-400/5 p-3 clip-corner">
              <div className="text-xs font-mono text-red-400">{pollError}</div>
              <button
                onClick={onBack}
                className="mt-2 px-3 py-1.5 text-xs font-mono text-subtle border border-border rounded hover:border-border-strong hover:text-text transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {/* API Key verify */}
      {method === "apikey" && (
        <div className="border border-border bg-surface p-5 space-y-4 clip-corner">
          {verifyStatus === "loading" && (
            <div className="flex items-center gap-2 py-4">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400" />
              </span>
              <span className="text-xs font-mono text-yellow-400">Verifying API key...</span>
            </div>
          )}

          {verifyError && (
            <div className="border border-red-400/30 bg-red-400/5 p-3 clip-corner">
              <div className="text-xs font-mono text-red-400">{verifyError}</div>
            </div>
          )}
        </div>
      )}

      {/* MCP verify */}
      {method === "mcp" && (
        <div className="border border-border bg-surface p-5 space-y-4 clip-corner">
          <div className="text-xs font-mono text-subtle">
            After running the install command, paste this prompt in your IDE to verify:
          </div>

          <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-bg p-3 overflow-x-auto">
            {mcpVerifyPrompt}
          </pre>

          <button
            onClick={handleCopyVerifyPrompt}
            className="border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
          >
            {mcpCopied ? "Copied!" : "Copy Prompt"}
          </button>

          <div className="border-t border-border pt-4 space-y-2">
            <div className="text-[10px] font-mono text-subtle uppercase">
              Verify connection (optional)
            </div>
            <div className="text-[10px] font-mono text-muted">
              Paste your API key to confirm the connection is working:
            </div>
            <input
              value={mcpPastedKey}
              onChange={(e) => setMcpPastedKey(e.target.value)}
              placeholder="cd_live_..."
              autoComplete="off"
              spellCheck={false}
              className="w-full h-9 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleMcpVerify}
                disabled={verifyStatus === "loading"}
                className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {verifyStatus === "loading" ? "Verifying..." : "Verify"}
              </button>
              <button
                onClick={() => onVerified(null)}
                className="px-4 py-2 text-xs font-mono text-subtle border border-border rounded hover:border-border-strong hover:text-text transition-colors"
              >
                Skip verification
              </button>
            </div>
            {verifyError && (
              <div className="text-[10px] font-mono text-red-400" aria-live="polite">
                {verifyError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Agent info (shown when verified) */}
      {agentMe && (
        <div className="border border-secondary/30 bg-secondary/5 p-4 space-y-2 clip-corner">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
            <span className="text-xs font-mono font-bold text-emerald-400 uppercase">Connected</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-mono">
            <div>
              <span className="text-subtle">agent_id: </span>
              <span className="text-text">{agentMe.agent_id}</span>
            </div>
            {agentMe.installation_id && (
              <div>
                <span className="text-subtle">installation_id: </span>
                <span className="text-text">{agentMe.installation_id}</span>
              </div>
            )}
            {agentMe.owner_id && (
              <div>
                <span className="text-subtle">owner_id: </span>
                <span className="text-text">{agentMe.owner_id}</span>
              </div>
            )}
            {agentMe.oauth_scopes?.length > 0 && (
              <div className="sm:col-span-2">
                <span className="text-subtle">scopes: </span>
                <span className="text-text">{agentMe.oauth_scopes.join(", ")}</span>
              </div>
            )}
          </div>
          {masked && (
            <div>
              <span className="text-[10px] font-mono text-subtle">key: </span>
              <span className="text-[10px] font-mono text-text">{masked}</span>
              <span className="text-[10px] font-mono text-muted ml-2">Stored locally on this device.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
