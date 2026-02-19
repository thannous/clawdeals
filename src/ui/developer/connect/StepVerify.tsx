import { useCallback, useEffect, useReducer, useRef } from "react";
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

type StepVerifyState = {
  verifyStatus: "idle" | "loading" | "done" | "error";
  verifyError: string | null;
  agentMe: AgentMeResponse | null;
  exchangeStatus: "idle" | "loading" | "done" | "error";
  exchangeError: string | null;
  claimCopied: boolean;
  claimQrOpen: boolean;
  claimOpenMsg: string;
  mcpPastedKey: string;
  mcpCopied: boolean;
};

type StepVerifyAction =
  | { type: "verifyLoading" }
  | { type: "verifySuccess"; agentMe: AgentMeResponse }
  | { type: "verifyFailure"; error: string }
  | { type: "setAgentMe"; agentMe: AgentMeResponse }
  | { type: "exchangeDone" }
  | { type: "exchangeFailure"; error: string }
  | { type: "setClaimCopied"; value: boolean }
  | { type: "toggleClaimQrOpen" }
  | { type: "setClaimOpenMsg"; value: string }
  | { type: "setMcpPastedKey"; value: string }
  | { type: "setMcpCopied"; value: boolean };

function initStepVerifyState({
  method,
  apiKey
}: {
  method: ConnectionMethod;
  apiKey: string | null;
}): StepVerifyState {
  return {
    verifyStatus: method === "apikey" && apiKey ? "loading" : "idle",
    verifyError: null,
    agentMe: null,
    exchangeStatus: "idle",
    exchangeError: null,
    claimCopied: false,
    claimQrOpen: false,
    claimOpenMsg: "",
    mcpPastedKey: "",
    mcpCopied: false
  };
}

function stepVerifyReducer(state: StepVerifyState, action: StepVerifyAction): StepVerifyState {
  switch (action.type) {
    case "verifyLoading":
      return { ...state, verifyStatus: "loading", verifyError: null };
    case "verifySuccess":
      return { ...state, verifyStatus: "done", verifyError: null, agentMe: action.agentMe };
    case "verifyFailure":
      return { ...state, verifyStatus: "error", verifyError: action.error };
    case "setAgentMe":
      return { ...state, agentMe: action.agentMe };
    case "exchangeDone":
      return { ...state, exchangeStatus: "done", exchangeError: null };
    case "exchangeFailure":
      return { ...state, exchangeStatus: "error", exchangeError: action.error };
    case "setClaimCopied":
      return { ...state, claimCopied: action.value };
    case "toggleClaimQrOpen":
      return { ...state, claimQrOpen: !state.claimQrOpen };
    case "setClaimOpenMsg":
      return { ...state, claimOpenMsg: action.value };
    case "setMcpPastedKey":
      return { ...state, mcpPastedKey: action.value };
    case "setMcpCopied":
      return { ...state, mcpCopied: action.value };
    default:
      return state;
  }
}

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

  const [state, dispatch] = useReducer(
    stepVerifyReducer,
    { method, apiKey },
    initStepVerifyState
  );

  const mcpVerifyPrompt = t("step.verify.mcp.title") === "Verify MCP installation"
    ? `List tools, then call:\nclawdeals.deals.list { "limit": 1 }`
    : `Liste les tools, puis appelle:\nclawdeals.deals.list { "limit": 1 }`;

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
          dispatch({ type: "verifySuccess", agentMe: data });
          onVerified(data);
        } else {
          dispatch({ type: "verifyFailure", error: tRef.current("step.verify.apikey.identityError") });
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        dispatch({ type: "verifyFailure", error: err?.message || tRef.current("step.verify.apikey.failed") });
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
        dispatch({ type: "exchangeDone" });
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
        dispatch({ type: "setAgentMe", agentMe: me });
        onVerified(me);
      })
      .catch((err: any) => {
        if (cancelled) return;
        dispatch({ type: "exchangeFailure", error: err?.message || tRef.current("step.verify.exchangeFailed") });
      });

    return () => {
      cancelled = true;
      exchangeStartedRef.current = false;
    };
  }, [method, pollStatus, claimSession, onExchangeForApiKey, onApiKeySet, onVerified]);

  // MCP manual verify
  const handleMcpVerify = useCallback(async () => {
    const key = state.mcpPastedKey.trim() || apiKey;
    if (!key) {
      dispatch({ type: "verifyFailure", error: t("step.verify.mcp.pasteToVerify") });
      return;
    }

    dispatch({ type: "verifyLoading" });

    try {
      const res = await apiRequest<{ data: AgentMeResponse }>({
        path: "/v1/agents/me",
        method: "GET",
        apiKey: key
      });
      const data = res.data?.data;
      if (data?.agent_id) {
        dispatch({ type: "verifySuccess", agentMe: data });
        onApiKeySet(key, data.agent_id);
        onVerified(data);
      } else {
        dispatch({ type: "verifyFailure", error: t("step.verify.mcp.identityError") });
      }
    } catch (err: any) {
      dispatch({ type: "verifyFailure", error: err?.message || t("step.verify.mcp.failed") });
    }
  }, [state.mcpPastedKey, apiKey, t, onApiKeySet, onVerified]);

  const handleCopyVerifyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcpVerifyPrompt);
      dispatch({ type: "setMcpCopied", value: true });
      setTimeout(() => dispatch({ type: "setMcpCopied", value: false }), 2000);
    } catch {
      // ignore
    }
  }, [mcpVerifyPrompt]);

  const handleOpenClaimUrl = useCallback(() => {
    if (!claimSession?.claim_url) return;

    const opened = window.open(claimSession.claim_url, "_blank", "noopener,noreferrer");
    if (!opened) {
      dispatch({ type: "setClaimOpenMsg", value: t("step.verify.claim.popupBlocked") });
      return;
    }

    dispatch({ type: "setClaimOpenMsg", value: t("step.verify.claim.pageOpened") });
  }, [claimSession, t]);

  const handleCopyClaimUrl = useCallback(async () => {
    if (!claimSession?.claim_url) return;
    try {
      await navigator.clipboard.writeText(claimSession.claim_url);
      dispatch({ type: "setClaimCopied", value: true });
      dispatch({ type: "setClaimOpenMsg", value: "" });
      setTimeout(() => dispatch({ type: "setClaimCopied", value: false }), 2000);
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
                {state.claimOpenMsg && (
                  <div className="text-xs font-mono text-success" aria-live="polite">
                    {state.claimOpenMsg}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-subtle">{t("step.verify.claim.shareLink")}</span>
                  <button
                    onClick={handleCopyClaimUrl}
                    className="h-8 px-3 border border-border text-xs font-bold uppercase tracking-widest hover:border-border-strong hover:text-text transition-colors"
                  >
                    {state.claimCopied ? t("common.copied") : t("step.verify.claim.copyLink")}
                  </button>
                  <button
                    onClick={() => dispatch({ type: "toggleClaimQrOpen" })}
                    className="h-8 px-3 border border-border text-xs font-bold uppercase tracking-widest hover:border-border-strong hover:text-text transition-colors"
                  >
                    {state.claimQrOpen ? t("step.verify.claim.hideQr") : t("step.verify.claim.qrCode")}
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
              {state.claimQrOpen && (
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

          {pollStatus === "claimed" && state.exchangeStatus === "loading" && (
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

          {state.exchangeError && (
            <div className="border border-error/30 bg-error/5 p-3 clip-corner">
              <div className="text-xs font-mono text-error">{state.exchangeError}</div>
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
          {state.verifyStatus === "loading" && (
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

          {state.verifyError && (
            <div className="border border-error/30 bg-error/5 p-3 clip-corner">
              <div className="text-xs font-mono text-error">{state.verifyError}</div>
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
            {state.mcpCopied ? t("common.copied") : t("step.verify.mcp.copyPrompt")}
          </button>

          <div className="border-t border-border pt-4 space-y-2">
            <div className="text-xs font-mono text-subtle uppercase">
              {t("step.verify.mcp.verifyOptional")}
            </div>
            <div className="text-xs font-mono text-muted">
              {t("step.verify.mcp.pasteKeyPrompt")}
            </div>
            <input
              value={state.mcpPastedKey}
              onChange={(e) => dispatch({ type: "setMcpPastedKey", value: e.target.value })}
              placeholder="cd_live_..."
              autoComplete="off"
              spellCheck={false}
              className="w-full h-9 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleMcpVerify}
                disabled={state.verifyStatus === "loading"}
                className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {state.verifyStatus === "loading" ? t("step.verify.mcp.verifying") : t("step.verify.mcp.verify")}
              </button>
              <button
                onClick={() => onVerified(null)}
                className="px-4 py-2 text-xs font-mono text-subtle border border-border rounded hover:border-border-strong hover:text-text transition-colors"
              >
                {t("step.verify.mcp.skipVerify")}
              </button>
            </div>
            {state.verifyError && (
              <div className="text-xs font-mono text-error" aria-live="polite">
                {state.verifyError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Agent info (shown when verified) */}
      {state.agentMe && (
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
              <span className="text-text">{state.agentMe.agent_id}</span>
            </div>
            {state.agentMe.installation_id && (
              <div>
                <span className="text-subtle">installation_id: </span>
                <span className="text-text">{state.agentMe.installation_id}</span>
              </div>
            )}
            {state.agentMe.owner_id && (
              <div>
                <span className="text-subtle">owner_id: </span>
                <span className="text-text">{state.agentMe.owner_id}</span>
              </div>
            )}
            {state.agentMe.oauth_scopes?.length > 0 && (
              <div className="sm:col-span-2">
                <span className="text-subtle">scopes: </span>
                <span className="text-text">{state.agentMe.oauth_scopes.join(", ")}</span>
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
