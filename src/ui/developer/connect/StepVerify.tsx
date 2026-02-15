import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "react-qr-code";

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
  const t = useTranslations("connect");
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  const [verifyStatus, setVerifyStatus] = useState<"idle" | "loading" | "done" | "error">(
    () => (method === "apikey" && apiKey ? "loading" : "idle")
  );
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [agentMe, setAgentMe] = useState<AgentMeResponse | null>(null);
  const [exchangeStatus, setExchangeStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [claimCopied, setClaimCopied] = useState(false);
  const [claimQrOpen, setClaimQrOpen] = useState(false);
  const [claimOpenMsg, setClaimOpenMsg] = useState("");

  // MCP verify state
  const [mcpPastedKey, setMcpPastedKey] = useState("");

  const mcpVerifyPrompt = t("step.verify.mcp.title") === "Verify MCP installation"
    ? `List tools, then call:\nclawdeals.deals.list { "limit": 1 }`
    : `Liste les tools, puis appelle:\nclawdeals.deals.list { "limit": 1 }`;
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
          setVerifyError(tRef.current("step.verify.apikey.identityError"));
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setVerifyStatus("error");
        setVerifyError(err?.message || tRef.current("step.verify.apikey.failed"));
      });

    return () => {
      cancelled = true;
      verifyStartedRef.current = false;
    };
  }, [method, apiKey, onVerified]);

  // Auto-exchange when claim is successful
  useEffect(() => {
    if (method !== "claim" || pollStatus !== "claimed" || !claimSession || exchangeStartedRef.current) return;
    exchangeStartedRef.current = true;

    let cancelled = false;

    onExchangeForApiKey(claimSession)
      .then(async (result) => {
        if (cancelled) return;
        setExchangeStatus("done");
        onApiKeySet(result.api_key, result.agent_id);

        let me: AgentMeResponse = {
          agent_id: result.agent_id,
          name: null,
          owner_id: null,
          installation_id: result.installation_id,
          oauth_scopes: ["agent:read", "agent:write"]
        };
        try {
          const meResult = await apiRequest<{ data: AgentMeResponse }>({
            path: "/v1/agents/me",
            method: "GET",
            apiKey: result.api_key
          });
          const resolved = meResult.data?.data;
          if (resolved?.agent_id) {
            me = resolved;
          }
        } catch {
          // Keep fallback identity when follow-up fetch fails.
        }
        if (cancelled) return;
        setAgentMe(me);
        onVerified(me);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setExchangeStatus("error");
        setExchangeError(err?.message || tRef.current("step.verify.exchangeFailed"));
      });

    return () => {
      cancelled = true;
      exchangeStartedRef.current = false;
    };
  }, [method, pollStatus, claimSession, onExchangeForApiKey, onApiKeySet, onVerified]);

  // MCP manual verify
  const handleMcpVerify = useCallback(async () => {
    const key = mcpPastedKey.trim() || apiKey;
    if (!key) {
      setVerifyError(t("step.verify.mcp.pasteToVerify"));
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
        setVerifyError(t("step.verify.mcp.identityError"));
      }
    } catch (err: any) {
      setVerifyStatus("error");
      setVerifyError(err?.message || t("step.verify.mcp.failed"));
    }
  }, [mcpPastedKey, apiKey, t, onApiKeySet, onVerified]);

  const handleCopyVerifyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcpVerifyPrompt);
      setMcpCopied(true);
      setTimeout(() => setMcpCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [mcpVerifyPrompt]);

  const handleOpenClaimUrl = useCallback(() => {
    if (!claimSession?.claim_url) return;

    const opened = window.open(claimSession.claim_url, "_blank", "noopener,noreferrer");
    if (!opened) {
      setClaimOpenMsg(t("step.verify.claim.popupBlocked"));
      return;
    }

    setClaimOpenMsg(t("step.verify.claim.pageOpened"));
  }, [claimSession, t]);

  const handleCopyClaimUrl = useCallback(async () => {
    if (!claimSession?.claim_url) return;
    try {
      await navigator.clipboard.writeText(claimSession.claim_url);
      setClaimCopied(true);
      setClaimOpenMsg("");
      setTimeout(() => setClaimCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [claimSession]);

  const masked = apiKey ? maskApiKey(apiKey) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight">
            {method === "claim" && t("step.verify.claim.waitingTitle")}
            {method === "apikey" && t("step.verify.apikey.title")}
            {method === "mcp" && t("step.verify.mcp.title")}
          </h2>
          <p className="text-xs font-mono text-subtle">
            {method === "claim" && t("step.verify.claim.waitingSubtitle")}
            {method === "apikey" && t("step.verify.apikey.subtitle")}
            {method === "mcp" && t("step.verify.mcp.subtitle")}
          </p>
        </div>
        <button
          onClick={onBack}
          className="px-3 py-1.5 text-xs font-mono text-subtle border border-border rounded hover:border-border-strong hover:text-text transition-colors"
        >
          {t("common.back")}
        </button>
      </div>

      {/* Claim Link verify */}
      {method === "claim" && (
        <div className="space-y-5">
          {claimSession && (pollStatus === "polling" || pollStatus === "idle") && (
            <>
              {/* Status indicator */}
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-warning" />
                </span>
                <span className="text-xs font-mono text-warning">
                  {t("step.verify.claim.polling")}
                </span>
              </div>

              {/* Actions */}
              <div className="border border-border bg-surface p-5 space-y-4 clip-corner">
                <button
                  onClick={handleOpenClaimUrl}
                  className="w-full h-11 border border-primary bg-primary text-bg text-xs font-bold uppercase tracking-widest hover:bg-text hover:border-text transition-colors"
                >
                  {t("step.verify.claim.openClaimPage")}
                </button>
                {claimOpenMsg && (
                  <div className="text-xs font-mono text-success" aria-live="polite">
                    {claimOpenMsg}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-subtle">{t("step.verify.claim.shareLink")}</span>
                  <button
                    onClick={handleCopyClaimUrl}
                    className="h-8 px-3 border border-border text-xs font-bold uppercase tracking-widest hover:border-border-strong hover:text-text transition-colors"
                  >
                    {claimCopied ? t("common.copied") : t("step.verify.claim.copyLink")}
                  </button>
                  <button
                    onClick={() => setClaimQrOpen((prev) => !prev)}
                    className="h-8 px-3 border border-border text-xs font-bold uppercase tracking-widest hover:border-border-strong hover:text-text transition-colors"
                  >
                    {claimQrOpen ? t("step.verify.claim.hideQr") : t("step.verify.claim.qrCode")}
                  </button>
                </div>
              </div>

              {/* Verification code — shared context for both paths */}
              <div className="border border-border bg-bg p-4 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-mono text-subtle uppercase tracking-wider">
                    {t("step.verify.claim.confirmCode")}
                  </div>
                  <div className="text-xs font-mono text-muted">
                    {t("step.verify.claim.confirmCodeDesc")}
                  </div>
                </div>
                <div className="text-2xl font-bold tracking-widest text-text whitespace-nowrap">
                  {claimSession.verification_code}
                </div>
              </div>

              {/* QR code panel */}
              {claimQrOpen && (
                <div className="border border-border bg-bg p-5 flex flex-col items-center gap-3">
                  <QRCode
                    value={claimSession.claim_url}
                    size={172}
                    bgColor="transparent"
                    fgColor="currentColor"
                    className="text-text"
                  />
                  <div className="text-xs font-mono text-subtle text-center">
                    {t("step.verify.claim.scanQrDesc")}
                    <span className="font-bold text-text">{claimSession.verification_code}</span>.
                  </div>
                </div>
              )}
            </>
          )}

          {pollStatus === "claimed" && exchangeStatus === "loading" && (
            <div className="border border-success/20 bg-success/5 p-5 flex items-center justify-center gap-2 clip-corner">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
              </span>
              <span className="text-sm font-mono text-success">
                {t("step.verify.claim.approved")}
              </span>
            </div>
          )}

          {exchangeError && (
            <div className="border border-error/30 bg-error/5 p-3 clip-corner">
              <div className="text-xs font-mono text-error">{exchangeError}</div>
              <button
                onClick={onBack}
                className="mt-2 px-3 py-1.5 text-xs font-mono text-subtle border border-border rounded hover:border-border-strong hover:text-text transition-colors"
              >
                {t("common.tryAgain")}
              </button>
            </div>
          )}

          {pollError && (
            <div className="border border-error/30 bg-error/5 p-3 clip-corner">
              <div className="text-xs font-mono text-error">{pollError}</div>
              <button
                onClick={onBack}
                className="mt-2 px-3 py-1.5 text-xs font-mono text-subtle border border-border rounded hover:border-border-strong hover:text-text transition-colors"
              >
                {t("common.tryAgain")}
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
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-warning" />
              </span>
              <span className="text-xs font-mono text-warning">
                {t("step.verify.apikey.verifying")}
              </span>
            </div>
          )}

          {verifyError && (
            <div className="border border-error/30 bg-error/5 p-3 clip-corner">
              <div className="text-xs font-mono text-error">{verifyError}</div>
            </div>
          )}
        </div>
      )}

      {/* MCP verify */}
      {method === "mcp" && (
        <div className="border border-border bg-surface p-5 space-y-4 clip-corner">
          <div className="text-xs font-mono text-subtle">
            {t("step.verify.mcp.instructions")}
          </div>

          <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-bg p-3 overflow-x-auto">
            {mcpVerifyPrompt}
          </pre>

          <button
            onClick={handleCopyVerifyPrompt}
            className="border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
          >
            {mcpCopied ? t("common.copied") : t("step.verify.mcp.copyPrompt")}
          </button>

          <div className="border-t border-border pt-4 space-y-2">
            <div className="text-xs font-mono text-subtle uppercase">
              {t("step.verify.mcp.verifyOptional")}
            </div>
            <div className="text-xs font-mono text-muted">
              {t("step.verify.mcp.pasteKeyPrompt")}
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
                {verifyStatus === "loading" ? t("step.verify.mcp.verifying") : t("step.verify.mcp.verify")}
              </button>
              <button
                onClick={() => onVerified(null)}
                className="px-4 py-2 text-xs font-mono text-subtle border border-border rounded hover:border-border-strong hover:text-text transition-colors"
              >
                {t("step.verify.mcp.skipVerify")}
              </button>
            </div>
            {verifyError && (
              <div className="text-xs font-mono text-error" aria-live="polite">
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
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
            </span>
            <span className="text-xs font-mono font-bold text-success uppercase">
              {t("step.verify.connected")}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
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
              <span className="text-xs font-mono text-subtle">key: </span>
              <span className="text-xs font-mono text-text">{masked}</span>
              <span className="text-xs font-mono text-muted ml-2">
                {t("step.verify.storedLocally")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
