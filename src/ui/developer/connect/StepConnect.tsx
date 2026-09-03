import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "react-qr-code";
import Link from "next/link";

import { apiRequest, maskApiKey } from "../api";
import { generateFunnyAgentName } from "./agent-name-generator";
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
  hasOwnerSession: boolean;
  acquisitionId: string | null;
  loginHref: string;
  signupHref: string;
};

type KeyMode = "generate" | "paste";
type AsyncStatus = "idle" | "loading" | "success" | "error";
type MethodTab = "mcp" | "api";

const METHOD_TABS: readonly MethodTab[] = ["mcp", "api"];
const DEMO_SANDBOX_URL = "https://sandbox.clawdeals.com/webmcp-challenge";

function KeyModeToggle({
  mode,
  onModeChange,
  generateLabel,
  pasteLabel
}: {
  mode: KeyMode;
  onModeChange: (mode: KeyMode) => void;
  generateLabel: string;
  pasteLabel: string;
}) {
  return (
    <div className="flex gap-1 bg-bg p-0.5 w-fit border border-border">
      <button
        onClick={() => onModeChange("generate")}
        className={`px-3 py-1 text-xs font-bold uppercase tracking-widest ${
          mode === "generate" ? "bg-text text-bg" : "text-subtle hover:text-text"
        } transition-colors`}
      >
        {generateLabel}
      </button>
      <button
        onClick={() => onModeChange("paste")}
        className={`px-3 py-1 text-xs font-bold uppercase tracking-widest ${
          mode === "paste" ? "bg-text text-bg" : "text-subtle hover:text-text"
        } transition-colors`}
      >
        {pasteLabel}
      </button>
    </div>
  );
}

function StatusMessage({ message, status }: { message: string; status: AsyncStatus }) {
  if (!message) return null;
  return (
    <div
      className={`text-xs font-mono ${
        status === "error" ? "text-error" : status === "success" ? "text-success" : "text-subtle"
      }`}
      aria-live="polite"
    >
      {message}
    </div>
  );
}

export default function StepConnect(props: Props) {
  return useStepConnectView(props);
}

function useStepConnectView({
  apiKey: storedKey,
  onMethodSelected,
  onApiKeySet,
  onClaimSessionCreated,
  claimSession,
  pollStatus,
  pollError,
  isCreatingSession,
  onCreateSession,
  hasOwnerSession,
  acquisitionId,
  loginHref,
  signupHref
}: Props) {
  const t = useTranslations("connect");
  // --- Claim Link state ---
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimCopied, setClaimCopied] = useState(false);
  const [claimQrOpen, setClaimQrOpen] = useState(false);
  const [claimOpenMsg, setClaimOpenMsg] = useState("");

  // --- API Key state ---
  const [method, setMethod] = useState<MethodTab>("mcp");
  const [keyMode, setKeyMode] = useState<"generate" | "paste">("generate");
  const [agentName, setAgentName] = useState(() => generateFunnyAgentName());
  const [pastedKey, setPastedKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [keyMessage, setKeyMessage] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  // --- MCP state ---
  const [mcpManualTarget, setMcpManualTarget] = useState<
    "cursor" | "claude" | "claudeCode" | "codex" | "windsurf" | "gemini" | "generic"
  >("cursor");
  const [mcpCopyMsg, setMcpCopyMsg] = useState("");

  // --- MCP sub-step state (key → configure) ---
  const [mcpSubStepOverride, setMcpSubStep] = useState<"key" | "configure" | null>(null);
  const mcpSubStep: "key" | "configure" = mcpSubStepOverride ?? (storedKey ? "configure" : "key");
  const [mcpKeyMode, setMcpKeyMode] = useState<"generate" | "paste">("generate");
  const [mcpAgentName, setMcpAgentName] = useState(() => generateFunnyAgentName());
  const [mcpPastedKey, setMcpPastedKey] = useState("");
  const [mcpKeyStatus, setMcpKeyStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mcpKeyMessage, setMcpKeyMessage] = useState("");

  const mcpInstallSnippetNpx = `export CLAWDEALS_API_KEY="${storedKey || "<YOUR_API_KEY>"}"\nnpx -y clawdeals-mcp install`;

  const mcpManualConfig = useMemo(() => {
    const env: Record<string, string> = {
      CLAWDEALS_API_KEY: storedKey || "cd_live_..."
    };

    if (mcpManualTarget === "codex") {
      const envPairs = Object.entries(env).map(([key, value]) => `${key} = "${value}"`);
      return `[mcp_servers.clawdeals]\ncommand = "npx"\nargs = ["-y", "clawdeals-mcp"]\nenv = { ${envPairs.join(", ")} }`;
    }

    const base = {
      clawdeals: {
        type: "stdio",
        command: "npx",
        args: ["-y", "clawdeals-mcp"],
        env
      }
    };

    if (
      mcpManualTarget === "claude" ||
      mcpManualTarget === "claudeCode" ||
      mcpManualTarget === "windsurf" ||
      mcpManualTarget === "gemini"
    ) {
      return JSON.stringify({ mcpServers: base }, null, 2);
    }

    return JSON.stringify({ servers: base }, null, 2);
  }, [storedKey, mcpManualTarget]);

  const handleKeyModeChange = useCallback((nextMode: KeyMode) => {
    setKeyMode(nextMode);
    if (nextMode === "generate") {
      setAgentName((prev) => (prev.trim() ? prev : generateFunnyAgentName()));
    }
  }, []);

  const handleMcpKeyModeChange = useCallback((nextMode: KeyMode) => {
    setMcpKeyMode(nextMode);
    if (nextMode === "generate") {
      setMcpAgentName((prev) => (prev.trim() ? prev : generateFunnyAgentName()));
    }
  }, []);

  // --- Claim Link handlers ---
  const handleCreateClaim = useCallback(async () => {
    setClaimError(null);
    setClaimOpenMsg("");
    setClaimQrOpen(false);
    try {
      const session = await onCreateSession();
      onClaimSessionCreated(session);
      onMethodSelected("claim");
    } catch (err: any) {
      setClaimError(err?.message || t("step.connect.claim.createFailed"));
    }
  }, [t, onCreateSession, onClaimSessionCreated, onMethodSelected]);

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

  const handleOpenClaimUrl = useCallback(() => {
    if (!claimSession?.claim_url) return;

    const opened = window.open(claimSession.claim_url, "_blank", "noopener,noreferrer");
    if (!opened) {
      setClaimOpenMsg(t("step.connect.claim.popupBlocked"));
      return;
    }

    setClaimOpenMsg(t("step.connect.claim.pageOpened"));
  }, [claimSession, t]);

  // --- API Key handlers ---
  const handleGenerate = useCallback(async () => {
    setKeyStatus("loading");
    setKeyMessage("");
    try {
      const trimmed = agentName.trim();
      const name = trimmed || generateFunnyAgentName();
      if (!trimmed) {
        setAgentName(name);
      }
      const result = await apiRequest<RegisterResult>({
        path: "/v1/agents",
        method: "POST",
        idempotencyKey: randomIdempotencyKey(),
        body: { name, ...(acquisitionId ? { acquisition_id: acquisitionId } : {}) }
      });
      const apiKey = result.data?.data?.api_key;
      const agent_id = result.data?.data?.agent_id;
      if (!apiKey || !agent_id) {
        setKeyStatus("error");
        setKeyMessage(t("common.unexpectedResponse"));
        return;
      }
      setKeyStatus("success");
      setKeyMessage(t("step.connect.apikey.generatedMsg"));
      setGeneratedKey(apiKey);
      onApiKeySet(apiKey, agent_id);
    } catch (error: any) {
      setKeyStatus("error");
      setKeyMessage(error?.message || t("common.generateFailed"));
    }
  }, [acquisitionId, agentName, t, onApiKeySet]);

  const handleCopyGeneratedKey = useCallback(async () => {
    if (!generatedKey) return;
    try {
      await navigator.clipboard.writeText(generatedKey);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [generatedKey]);

  const handleContinueAfterGenerate = useCallback(() => {
    onMethodSelected("apikey");
  }, [onMethodSelected]);

  const handleValidate = useCallback(async () => {
    const key = pastedKey.trim();
    if (!key) {
      setKeyStatus("error");
      setKeyMessage(t("common.pastePrompt"));
      return;
    }
    if (!isLikelyApiKey(key)) {
      setKeyStatus("error");
      setKeyMessage(t("common.invalidKeyFormat"));
      return;
    }
    setKeyStatus("loading");
    setKeyMessage("");
    try {
      await apiRequest({ path: "/v1/deals?limit=1", method: "GET", apiKey: key });
      setKeyStatus("success");
      setKeyMessage(t("step.connect.apikey.validated"));
      onApiKeySet(key);
      onMethodSelected("apikey");
    } catch (error: any) {
      setKeyStatus("error");
      setKeyMessage(error?.message || t("step.connect.apikey.invalid"));
    }
  }, [pastedKey, t, onApiKeySet, onMethodSelected]);

  // --- MCP handlers ---
  const handleCopyMcpInstall = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMcpCopyMsg(t("common.copied"));
      setTimeout(() => setMcpCopyMsg(""), 2000);
    } catch {
      setMcpCopyMsg(t("step.connect.mcp.copyFailed"));
    }
  }, [t]);

  const handleCopyMcpJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcpManualConfig);
      setMcpCopyMsg(t("step.connect.mcp.configCopied"));
      setTimeout(() => setMcpCopyMsg(""), 2000);
    } catch {
      setMcpCopyMsg(t("step.connect.mcp.copyFailed"));
    }
  }, [t, mcpManualConfig]);

  const handleMcpDone = useCallback(() => {
    onMethodSelected("mcp");
  }, [onMethodSelected]);

  // --- MCP key handlers ---
  const handleMcpGenerate = useCallback(async () => {
    setMcpKeyStatus("loading");
    setMcpKeyMessage("");
    try {
      const trimmed = mcpAgentName.trim();
      const name = trimmed || generateFunnyAgentName();
      if (!trimmed) setMcpAgentName(name);
      const result = await apiRequest<RegisterResult>({
        path: "/v1/agents",
        method: "POST",
        idempotencyKey: randomIdempotencyKey(),
        body: { name, ...(acquisitionId ? { acquisition_id: acquisitionId } : {}) }
      });
      const apiKey = result.data?.data?.api_key;
      const agent_id = result.data?.data?.agent_id;
      if (!apiKey || !agent_id) {
        setMcpKeyStatus("error");
        setMcpKeyMessage(t("common.unexpectedResponse"));
        return;
      }
      setMcpKeyStatus("success");
      setMcpKeyMessage(t("step.connect.mcp.keyGenerated"));
      onApiKeySet(apiKey, agent_id);
      setMcpSubStep("configure");
    } catch (error: any) {
      setMcpKeyStatus("error");
      setMcpKeyMessage(error?.message || t("common.generateFailed"));
    }
  }, [acquisitionId, mcpAgentName, t, onApiKeySet]);

  const handleMcpValidate = useCallback(async () => {
    const key = mcpPastedKey.trim();
    if (!key) {
      setMcpKeyStatus("error");
      setMcpKeyMessage(t("common.pastePrompt"));
      return;
    }
    if (!isLikelyApiKey(key)) {
      setMcpKeyStatus("error");
      setMcpKeyMessage(t("common.invalidKeyFormat"));
      return;
    }
    setMcpKeyStatus("loading");
    setMcpKeyMessage("");
    try {
      await apiRequest({ path: "/v1/deals?limit=1", method: "GET", apiKey: key });
      setMcpKeyStatus("success");
      setMcpKeyMessage(t("step.connect.apikey.validated"));
      onApiKeySet(key);
      setMcpSubStep("configure");
    } catch (error: any) {
      setMcpKeyStatus("error");
      setMcpKeyMessage(error?.message || t("step.connect.apikey.invalid"));
    }
  }, [mcpPastedKey, t, onApiKeySet]);

  const isPolling = pollStatus === "polling";
  const isClaimed = pollStatus === "claimed";

  // --- MCP configure: full-page view ---
  if (mcpSubStep === "configure") {
    return (
      <div className="space-y-10">
        <div className="space-y-3">
          <button
            onClick={() => setMcpSubStep("key")}
            className="flex items-center gap-1.5 text-xs font-mono text-subtle hover:text-text transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {t("common.back")}
          </button>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("step.connect.mcp.configureTitle")}
          </h1>
          <p className="text-subtle font-mono text-sm max-w-lg leading-relaxed">
            {t("step.connect.mcp.configureSubtitle")}
          </p>
        </div>

        {/* Key success banner */}
        <div className="flex items-center gap-2 border border-success/30 bg-success/5 px-4 py-3 text-xs font-mono">
          <span className="text-success">{t("step.connect.mcp.keyLabel")}</span>
          <span className="text-text">{storedKey ? maskApiKey(storedKey) : "..."}</span>
          {storedKey && (
            <button
              onClick={() => handleCopyMcpInstall(storedKey)}
              className="ml-auto text-subtle hover:text-text transition-colors"
            >
              {mcpCopyMsg || t("common.copy")}
            </button>
          )}
        </div>

        <div className="text-[11px] font-mono text-subtle">{t("step.connect.mcp.chooseOneLabel")}</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Option A: auto install */}
          <div className="space-y-4 border border-border bg-surface p-6 clip-corner">
            <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">{t("step.connect.mcp.optionALabel")}</div>
            <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-bg p-3 overflow-x-auto">
              {mcpInstallSnippetNpx}
            </pre>
            <button
              onClick={() => handleCopyMcpInstall(mcpInstallSnippetNpx)}
              className="border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
            >
              {t("step.connect.mcp.copyNpx")}
            </button>
          </div>

          {/* Option B: manual config */}
          <div className="space-y-4 border border-border bg-surface p-6 clip-corner">
            <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">
              {t("step.connect.mcp.optionBLabel")}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "cursor" as const, label: "Cursor" },
                { id: "claude" as const, label: "Claude" },
                { id: "claudeCode" as const, label: "Claude Code" },
                { id: "codex" as const, label: "Codex" },
                { id: "windsurf" as const, label: "Windsurf" },
                { id: "gemini" as const, label: "Gemini CLI" },
                { id: "generic" as const, label: "Generic" }
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setMcpManualTarget(opt.id)}
                  className={`px-2.5 py-1 text-xs font-bold uppercase tracking-widest border ${
                    mcpManualTarget === opt.id
                      ? "border-primary text-primary"
                      : "border-border text-subtle hover:border-border-strong hover:text-text"
                  } transition-colors`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {mcpManualTarget === "codex" && (
              <div className="text-xs font-mono text-subtle">
                {t("step.connect.mcp.fileLabel")} <span className="text-text">~/.codex/config.toml</span>
              </div>
            )}
            {mcpManualTarget === "claudeCode" && (
              <div className="text-xs font-mono text-subtle">
                {t("step.connect.mcp.fileLabel")} <span className="text-text">./.mcp.json</span>
              </div>
            )}
            {mcpManualTarget === "windsurf" && (
              <div className="text-xs font-mono text-subtle">
                {t("step.connect.mcp.fileLabel")} <span className="text-text">~/.codeium/windsurf/mcp_config.json</span>
              </div>
            )}
            {mcpManualTarget === "gemini" && (
              <div className="text-xs font-mono text-subtle">
                {t("step.connect.mcp.fileLabel")} <span className="text-text">~/.gemini/settings.json</span>
              </div>
            )}
            <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-bg p-3 overflow-x-auto">
              {mcpManualConfig}
            </pre>
            <button
              onClick={handleCopyMcpJson}
              className="border border-border px-2.5 py-1 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
            >
              {t("step.connect.mcp.copyConfig")}
            </button>
          </div>
        </div>

        <button
          onClick={handleMcpDone}
          className="w-full h-12 font-bold uppercase tracking-wider text-sm border border-primary bg-primary text-bg hover:bg-text hover:text-bg transition-colors"
          data-testid="mcp-installed"
        >
          {t("step.connect.mcp.installed")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Heading */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          {t("step.connect.heading")}
        </h1>
        <p className="text-sm font-mono text-subtle max-w-lg leading-relaxed">
          {t("step.connect.heroDesc")}
        </p>
      </div>

      {/* No agent yet: point to the deterministic judge sandbox */}
      <aside
        className="border border-secondary/40 bg-secondary/5 p-5 clip-corner space-y-4"
        aria-labelledby="connect-demo-title"
        data-testid="connect-try-without-agent"
      >
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2">
            <div className="text-[11px] font-mono text-secondary uppercase tracking-widest">{t("step.connect.demo.eyebrow")}</div>
            <h2 id="connect-demo-title" className="text-lg font-bold tracking-tight">{t("step.connect.demo.title")}</h2>
            <p className="text-sm text-muted leading-relaxed max-w-xl">{t("step.connect.demo.desc")}</p>
          </div>
          <a
            href={DEMO_SANDBOX_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center justify-center h-11 px-6 border border-secondary text-secondary font-bold uppercase tracking-wider text-xs hover:bg-secondary hover:text-bg transition-colors"
          >
            {t("step.connect.demo.cta")}
          </a>
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((index) => (
            <li key={index} className="flex items-start gap-3 text-sm text-muted">
              <span className="shrink-0 w-6 h-6 border border-secondary/40 text-secondary font-mono text-[11px] flex items-center justify-center">
                {index + 1}
              </span>
              <span>{t(`step.connect.demo.step_${index}`)}</span>
            </li>
          ))}
        </ol>
      </aside>

      {/* Method selector: one key form, two destinations */}
      <div className="space-y-4">
        <div className="text-[11px] font-mono text-subtle uppercase tracking-widest">
          {t("step.connect.chooseMethod")}
        </div>
        <div role="tablist" aria-label={t("step.connect.chooseMethod")} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {METHOD_TABS.map((tab) => {
            const active = method === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`connect-method-panel-${tab}`}
                id={`connect-method-tab-${tab}`}
                onClick={() => setMethod(tab)}
                data-testid={`connect-method-${tab}`}
                className={`text-left border p-4 clip-corner transition-colors ${
                  active ? "border-primary bg-primary/5" : "border-border bg-surface hover:border-border-strong"
                }`}
              >
                <div className="text-sm font-bold tracking-wide text-text">{t(`step.connect.method.${tab}.title`)}</div>
                <div className="mt-1 text-xs text-muted leading-relaxed">{t(`step.connect.method.${tab}.desc`)}</div>
                <div className="mt-2 text-[10px] font-mono uppercase tracking-widest text-subtle">
                  {t(`step.connect.method.${tab}.tech`)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-6">
        {/* API Key */}
        <div
          id="connect-method-panel-api"
          role="tabpanel"
          aria-labelledby="connect-method-tab-api"
          hidden={method !== "api"}
          className="border border-border bg-surface p-6 space-y-4 clip-corner"
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-xs font-mono font-bold uppercase border border-border text-subtle rounded">
                API
              </span>
            </div>
            <div className="text-sm font-bold tracking-wide">{t("step.connect.apikey.manualTitle")}</div>
            <div className="text-xs font-mono text-subtle leading-relaxed">
              {t("step.connect.apikey.manualDesc")}
            </div>
          </div>

          <KeyModeToggle
            mode={keyMode}
            onModeChange={handleKeyModeChange}
            generateLabel={t("common.generate")}
            pasteLabel={t("common.iHaveAKey")}
          />

          {keyMode === "generate" ? (
            generatedKey ? (
              <div className="space-y-3">
                <pre className="text-xs font-mono text-text bg-bg border border-border p-3 overflow-x-auto select-all break-all">
                  {generatedKey}
                </pre>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyGeneratedKey}
                    className="border border-border px-3 py-2 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
                    data-testid="copy-generated-key"
                  >
                    {keyCopied ? t("common.copied") : t("step.firstwin.copyKeyFull")}
                  </button>
                  <button
                    onClick={handleContinueAfterGenerate}
                    className="flex-1 h-10 font-bold uppercase tracking-wider text-xs border border-primary bg-primary text-bg hover:bg-text hover:text-bg transition-colors"
                    data-testid="continue-after-generate"
                  >
                    {t("common.continue")}
                  </button>
                </div>
                <div className="text-xs font-mono text-subtle">
                  {t("step.connect.apikey.keySaveWarning")}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono text-subtle uppercase" htmlFor="connect-agent-name">
                    {t("common.agentNameLabel")}
                  </label>
                  <input
                    id="connect-agent-name"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder={t("common.agentNamePlaceholder")}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full h-10 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                    disabled={keyStatus === "loading"}
                  />
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={keyStatus === "loading"}
                  className={`w-full h-10 font-bold uppercase tracking-wider text-xs border border-primary ${
                    keyStatus === "loading"
                      ? "bg-surface-alt text-subtle cursor-not-allowed"
                      : "bg-primary text-bg hover:bg-text hover:text-bg"
                  } transition-colors`}
                  data-testid="generate-key"
                >
                  {keyStatus === "loading" ? t("common.generating") : t("common.generate")}
                </button>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-mono text-subtle uppercase" htmlFor="connect-paste-key">
                  {t("common.apiKeyLabel")}
                </label>
                <input
                  id="connect-paste-key"
                  value={pastedKey}
                  onChange={(e) => setPastedKey(e.target.value)}
                  placeholder="cd_live_..."
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full h-10 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                  disabled={keyStatus === "loading"}
                />
              </div>
              <button
                onClick={handleValidate}
                disabled={keyStatus === "loading"}
                className={`w-full h-10 font-bold uppercase tracking-wider text-xs border border-primary ${
                  keyStatus === "loading"
                    ? "bg-surface-alt text-subtle cursor-not-allowed"
                    : "bg-primary text-bg hover:bg-text hover:text-bg"
                } transition-colors`}
                data-testid="validate-key"
              >
                {keyStatus === "loading" ? t("common.validating") : t("common.validate")}
              </button>
            </div>
          )}

          <StatusMessage message={keyMessage} status={keyStatus} />
        </div>

        {/* MCP */}
        <div
          id="connect-method-panel-mcp"
          role="tabpanel"
          aria-labelledby="connect-method-tab-mcp"
          hidden={method !== "mcp"}
          className="border border-border bg-surface p-6 space-y-4 clip-corner"
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-xs font-mono font-bold uppercase border border-border text-subtle rounded">
                MCP
              </span>
            </div>
            <div className="text-sm font-bold tracking-wide">{t("step.connect.mcp.connectionTitle")}</div>
            <div className="text-xs font-mono text-subtle leading-relaxed">
              {t("step.connect.mcp.connectionDesc")}
            </div>
          </div>

          <KeyModeToggle
            mode={mcpKeyMode}
            onModeChange={handleMcpKeyModeChange}
            generateLabel={t("common.generate")}
            pasteLabel={t("common.iHaveAKey")}
          />

              {mcpKeyMode === "generate" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono text-subtle uppercase" htmlFor="mcp-agent-name">
                      {t("common.agentNameLabel")}
                    </label>
                    <input
                      id="mcp-agent-name"
                      value={mcpAgentName}
                      onChange={(e) => setMcpAgentName(e.target.value)}
                      placeholder={t("common.agentNamePlaceholder")}
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full h-10 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                      disabled={mcpKeyStatus === "loading"}
                    />
                  </div>
                  <button
                    onClick={handleMcpGenerate}
                    disabled={mcpKeyStatus === "loading"}
                    className={`w-full h-10 font-bold uppercase tracking-wider text-xs border border-primary ${
                      mcpKeyStatus === "loading"
                        ? "bg-surface-alt text-subtle cursor-not-allowed"
                        : "bg-primary text-bg hover:bg-text hover:text-bg"
                    } transition-colors`}
                    data-testid="mcp-generate-key"
                  >
                    {mcpKeyStatus === "loading" ? t("common.generating") : t("common.generate")}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono text-subtle uppercase" htmlFor="mcp-paste-key">
                      {t("common.apiKeyLabel")}
                    </label>
                    <input
                      id="mcp-paste-key"
                      value={mcpPastedKey}
                      onChange={(e) => setMcpPastedKey(e.target.value)}
                      placeholder="cd_live_..."
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full h-10 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                      disabled={mcpKeyStatus === "loading"}
                    />
                  </div>
                  <button
                    onClick={handleMcpValidate}
                    disabled={mcpKeyStatus === "loading"}
                    className={`w-full h-10 font-bold uppercase tracking-wider text-xs border border-primary ${
                      mcpKeyStatus === "loading"
                        ? "bg-surface-alt text-subtle cursor-not-allowed"
                        : "bg-primary text-bg hover:bg-text hover:text-bg"
                    } transition-colors`}
                    data-testid="mcp-validate-key"
                  >
                    {mcpKeyStatus === "loading" ? t("common.validating") : t("common.validate")}
                  </button>
                </div>
              )}

              <StatusMessage message={mcpKeyMessage} status={mcpKeyStatus} />

        </div>
      </div>

      {/* Account: framed as an unlock, after the value is visible */}
      {!hasOwnerSession && (
        <div className="border border-border bg-surface-alt p-4 clip-corner space-y-3" data-testid="connect-account-unlock">
          <div className="text-xs text-muted leading-relaxed">
            {t("step.connect.accountWarning")}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={loginHref}
              className="border border-primary bg-primary text-bg px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-text hover:border-text transition-colors"
            >
              {t("step.connect.logIn")}
            </Link>
            <Link
              href={signupHref}
              className="border border-border px-4 py-2 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
            >
              {t("step.connect.createAccount")}
            </Link>
          </div>
        </div>
      )}

      {/* Separator */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs font-mono text-subtle uppercase tracking-widest">
          {t("step.connect.orRemote")}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Claim Link */}
      <div className="border border-secondary/30 bg-surface p-6 md:p-8 space-y-6 clip-corner">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          <div className="space-y-3 flex-1">
            <span className="inline-block px-2.5 py-1 text-xs font-mono font-bold uppercase border border-primary/40 text-primary rounded">
              {t("step.connect.claim.selfInstallBadge")}
            </span>
            <div className="text-lg font-bold tracking-wide">
              {t("step.connect.claim.title")}
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-subtle">Claim Link</div>
            <div className="text-sm font-mono text-subtle leading-relaxed">
              {t("step.connect.claim.longDesc")}
            </div>
          </div>

          {!claimSession && (
            <button
              onClick={handleCreateClaim}
              disabled={isCreatingSession}
              className={`shrink-0 h-12 px-8 font-bold uppercase tracking-wider text-sm border border-primary ${
                isCreatingSession
                  ? "bg-surface-alt text-subtle cursor-not-allowed"
                  : "bg-primary text-bg hover:bg-text hover:text-bg"
              } transition-colors`}
            >
              {isCreatingSession
                ? t("step.connect.claim.creating")
                : t("step.connect.claim.generateLink")}
            </button>
          )}
        </div>

        {claimError && (
          <div className="text-xs font-mono text-error" aria-live="polite">
            {claimError}
          </div>
        )}

        {claimSession && (
          <div className="border-t border-border pt-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
              <div className="border border-border bg-bg p-4 space-y-2 sm:min-w-[200px]">
                <div className="text-xs font-mono text-subtle uppercase tracking-wider">
                  {t("step.connect.claim.confirmationCode")}
                </div>
                <div className="text-2xl font-bold tracking-widest text-text">
                  {claimSession.verification_code}
                </div>
              </div>

              <div className="space-y-3 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleOpenClaimUrl}
                    className="border border-primary bg-primary text-bg px-3 py-1.5 text-xs font-bold uppercase tracking-widest hover:bg-text hover:border-text transition-colors"
                  >
                    {t("step.connect.claim.approveNow")}
                  </button>
                  <button
                    onClick={handleCopyClaimUrl}
                    className="border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
                  >
                    {claimCopied ? t("common.copied") : t("step.verify.claim.copyLink")}
                  </button>
                  <button
                    onClick={() => setClaimQrOpen((prev) => !prev)}
                    className="border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
                  >
                    {claimQrOpen ? t("step.connect.claim.hideQr") : t("step.connect.claim.showQr")}
                  </button>
                </div>
                <div className="text-xs font-mono text-subtle break-all">
                  {claimSession.claim_url}
                </div>
                <div className="text-xs font-mono text-muted">
                  {t("step.connect.claim.shareDesc")}
                </div>
                <div className="flex flex-wrap gap-3 text-xs font-mono text-muted">
                  <span>{t("step.connect.claim.expiresIn")}</span>
                  <span className="text-border">|</span>
                  <span>{t("step.connect.claim.revocable")}</span>
                  <span className="text-border">|</span>
                  <span>{t("step.connect.claim.noKeyToCopy")}</span>
                </div>
                {claimOpenMsg && (
                  <div className="text-xs font-mono text-success" aria-live="polite">
                    {claimOpenMsg}
                  </div>
                )}
              </div>
            </div>

            {claimQrOpen && (
              <div className="border border-border bg-bg p-4 flex flex-col items-center gap-3">
                <div className="text-xs font-mono text-subtle uppercase tracking-wider">
                  {t("step.connect.claim.scanToApprove")}
                </div>
                <QRCode
                  value={claimSession.claim_url}
                  size={172}
                  bgColor="transparent"
                  fgColor="currentColor"
                  className="text-text"
                />
                <div className="text-xs font-mono text-subtle text-center">
                  {t("step.connect.claim.scanConfirmCode")}
                  <span className="text-text">{claimSession.verification_code}</span>.
                </div>
              </div>
            )}

            {isPolling && (
              <div className="flex items-center gap-2" aria-live="polite">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-warning" />
                </span>
                <span className="text-xs font-mono text-warning">
                  {t("step.connect.claim.waitingApproval")}
                </span>
              </div>
            )}

            {isClaimed && (
              <div className="flex items-center gap-2" aria-live="assertive">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
                </span>
                <span className="text-xs font-mono text-success">
                  {t("step.connect.claim.claimedConnecting")}
                </span>
              </div>
            )}

            {pollError && (
              <div className="text-xs font-mono text-error" aria-live="polite">
                {pollError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
