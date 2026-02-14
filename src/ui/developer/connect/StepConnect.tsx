import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import Link from "next/link";

import { apiRequest, maskApiKey } from "../api";
import { generateFunnyAgentName } from "./agent-name-generator";
import type { ConnectLocale, ConnectionMethod, ConnectSessionData, PollStatus } from "./types";

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
  locale: ConnectLocale;
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
};

export default function StepConnect({
  locale,
  apiKey: storedKey,
  onMethodSelected,
  onApiKeySet,
  onClaimSessionCreated,
  claimSession,
  pollStatus,
  pollError,
  isCreatingSession,
  onCreateSession,
  hasOwnerSession
}: Props) {
  const isFr = locale === "fr";
  // --- Claim Link state ---
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimCopied, setClaimCopied] = useState(false);
  const [claimQrOpen, setClaimQrOpen] = useState(false);
  const [claimOpenMsg, setClaimOpenMsg] = useState("");

  // --- API Key state ---
  const [keyMode, setKeyMode] = useState<"generate" | "paste">("generate");
  const [agentName, setAgentName] = useState("");
  const [pastedKey, setPastedKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [keyMessage, setKeyMessage] = useState("");

  // --- MCP state ---
  const [mcpManualTarget, setMcpManualTarget] = useState<
    "cursor" | "claude" | "claudeCode" | "codex" | "windsurf" | "gemini" | "generic"
  >("cursor");
  const [mcpCopyMsg, setMcpCopyMsg] = useState("");

  // --- MCP sub-step state (key → configure) ---
  const [mcpSubStepOverride, setMcpSubStep] = useState<"key" | "configure" | null>(null);
  const mcpSubStep: "key" | "configure" = mcpSubStepOverride ?? (storedKey ? "configure" : "key");
  const [mcpKeyMode, setMcpKeyMode] = useState<"generate" | "paste">("generate");
  const [mcpAgentName, setMcpAgentName] = useState("");
  const [mcpPastedKey, setMcpPastedKey] = useState("");
  const [mcpKeyStatus, setMcpKeyStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mcpKeyMessage, setMcpKeyMessage] = useState("");

  const optionChooseOneLabel = isFr
    ? "STEP_01: choisissez une seule option: A ou B."
    : "STEP_01: choose one option only: A or B.";
  const optionALabel = isFr ? "Option A (recommandée): installation auto" : "Option A (recommended): auto install";

  useEffect(() => {
    if (keyMode !== "generate") return;
    const timer = setTimeout(() => {
      setAgentName((prev) => (prev.trim() ? prev : generateFunnyAgentName()));
    }, 0);
    return () => clearTimeout(timer);
  }, [keyMode]);

  const mcpInstallSnippetNpx = useMemo(
    () => `export CLAWDEALS_API_KEY="${storedKey || "<YOUR_API_KEY>"}"\nnpx -y clawdeals-mcp install`,
    [storedKey]
  );

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
      setClaimError(err?.message || (isFr ? "Impossible de créer le lien de connexion." : "Failed to create claim link."));
    }
  }, [isFr, onCreateSession, onClaimSessionCreated, onMethodSelected]);

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
      setClaimOpenMsg(isFr ? "Popup bloquée. Utilisez Copier le lien." : "Popup blocked. Use Copy Link instead.");
      return;
    }

    setClaimOpenMsg(isFr ? "Page de connexion ouverte dans un nouvel onglet." : "Claim page opened in a new tab.");
  }, [claimSession, isFr]);

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
        body: { name }
      });
      const apiKey = result.data?.data?.api_key;
      const agent_id = result.data?.data?.agent_id;
      if (!apiKey || !agent_id) {
        setKeyStatus("error");
        setKeyMessage(isFr ? "Réponse serveur inattendue." : "Unexpected response from server.");
        return;
      }
      setKeyStatus("success");
      setKeyMessage(
        isFr
          ? "Clé API générée. Copiez-la maintenant: elle pourrait ne plus être affichée."
          : "API key generated. Copy it now: it may not be shown again."
      );
      onApiKeySet(apiKey, agent_id);
      onMethodSelected("apikey");
    } catch (error: any) {
      setKeyStatus("error");
      setKeyMessage(error?.message || (isFr ? "Impossible de générer la clé API." : "Failed to generate API key."));
    }
  }, [agentName, isFr, onApiKeySet, onMethodSelected]);

  const handleValidate = useCallback(async () => {
    const key = pastedKey.trim();
    if (!key) {
      setKeyStatus("error");
      setKeyMessage(isFr ? "Collez une clé API." : "Paste an API key.");
      return;
    }
    if (!isLikelyApiKey(key)) {
      setKeyStatus("error");
      setKeyMessage(isFr ? "Cette clé ne ressemble pas à une clé API ClawDeals." : "This does not look like a ClawDeals API key.");
      return;
    }
    setKeyStatus("loading");
    setKeyMessage("");
    try {
      await apiRequest({ path: "/v1/deals?limit=1", method: "GET", apiKey: key });
      setKeyStatus("success");
      setKeyMessage(isFr ? "Clé API validée." : "API key validated.");
      onApiKeySet(key);
      onMethodSelected("apikey");
    } catch (error: any) {
      setKeyStatus("error");
      setKeyMessage(error?.message || (isFr ? "Clé API invalide." : "Invalid API key."));
    }
  }, [pastedKey, isFr, onApiKeySet, onMethodSelected]);

  // --- MCP handlers ---
  const handleCopyMcpInstall = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMcpCopyMsg(isFr ? "Copié." : "Copied!");
      setTimeout(() => setMcpCopyMsg(""), 2000);
    } catch {
      setMcpCopyMsg(isFr ? "Échec de copie." : "Copy failed.");
    }
  }, [isFr]);

  const handleCopyMcpJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcpManualConfig);
      setMcpCopyMsg(isFr ? "Config copiée." : "Copied config!");
      setTimeout(() => setMcpCopyMsg(""), 2000);
    } catch {
      setMcpCopyMsg(isFr ? "Échec de copie." : "Copy failed.");
    }
  }, [isFr, mcpManualConfig]);

  const handleMcpDone = useCallback(() => {
    onMethodSelected("mcp");
  }, [onMethodSelected]);

  // --- MCP sub-step: auto-generate agent name ---
  useEffect(() => {
    if (mcpKeyMode !== "generate") return;
    const timer = setTimeout(() => {
      setMcpAgentName((prev) => (prev.trim() ? prev : generateFunnyAgentName()));
    }, 0);
    return () => clearTimeout(timer);
  }, [mcpKeyMode]);

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
        body: { name }
      });
      const apiKey = result.data?.data?.api_key;
      const agent_id = result.data?.data?.agent_id;
      if (!apiKey || !agent_id) {
        setMcpKeyStatus("error");
        setMcpKeyMessage(isFr ? "Réponse serveur inattendue." : "Unexpected response from server.");
        return;
      }
      setMcpKeyStatus("success");
      setMcpKeyMessage(
        isFr
          ? "Clé API générée. Elle sera intégrée dans la config ci-dessous."
          : "API key generated. It will be embedded in the config below."
      );
      onApiKeySet(apiKey, agent_id);
      setMcpSubStep("configure");
    } catch (error: any) {
      setMcpKeyStatus("error");
      setMcpKeyMessage(error?.message || (isFr ? "Impossible de générer la clé API." : "Failed to generate API key."));
    }
  }, [mcpAgentName, isFr, onApiKeySet]);

  const handleMcpValidate = useCallback(async () => {
    const key = mcpPastedKey.trim();
    if (!key) {
      setMcpKeyStatus("error");
      setMcpKeyMessage(isFr ? "Collez une clé API." : "Paste an API key.");
      return;
    }
    if (!isLikelyApiKey(key)) {
      setMcpKeyStatus("error");
      setMcpKeyMessage(isFr ? "Cette clé ne ressemble pas à une clé API ClawDeals." : "This does not look like a ClawDeals API key.");
      return;
    }
    setMcpKeyStatus("loading");
    setMcpKeyMessage("");
    try {
      await apiRequest({ path: "/v1/deals?limit=1", method: "GET", apiKey: key });
      setMcpKeyStatus("success");
      setMcpKeyMessage(isFr ? "Clé API validée." : "API key validated.");
      onApiKeySet(key);
      setMcpSubStep("configure");
    } catch (error: any) {
      setMcpKeyStatus("error");
      setMcpKeyMessage(error?.message || (isFr ? "Clé API invalide." : "Invalid API key."));
    }
  }, [mcpPastedKey, isFr, onApiKeySet]);

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
            {isFr ? "Retour" : "Back"}
          </button>
          <h1 className="text-3xl font-bold tracking-tight">
            {isFr ? "Configurez MCP dans votre IDE" : "Configure MCP in your IDE"}
          </h1>
          <p className="text-subtle font-mono text-sm max-w-lg leading-relaxed">
            {isFr
              ? "Votre clé API est prête. Choisissez une méthode d'installation ci-dessous."
              : "Your API key is ready. Choose an install method below."}
          </p>
        </div>

        {/* Key success banner */}
        <div className="flex items-center gap-2 border border-success/30 bg-success/5 px-4 py-3 text-xs font-mono">
          <span className="text-success">{isFr ? "Clé:" : "Key:"}</span>
          <span className="text-text">{storedKey ? maskApiKey(storedKey) : "..."}</span>
          {storedKey && (
            <button
              onClick={() => handleCopyMcpInstall(storedKey)}
              className="ml-auto text-subtle hover:text-text transition-colors"
            >
              {mcpCopyMsg || (isFr ? "Copier" : "Copy")}
            </button>
          )}
        </div>

        <div className="text-[11px] font-mono text-subtle">{optionChooseOneLabel}</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Option A: auto install */}
          <div className="space-y-4 border border-border bg-surface p-6 clip-corner">
            <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">{optionALabel}</div>
            <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-bg p-3 overflow-x-auto">
              {mcpInstallSnippetNpx}
            </pre>
            <button
              onClick={() => handleCopyMcpInstall(mcpInstallSnippetNpx)}
              className="border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
            >
              {isFr ? "Copier npx" : "Copy npx"}
            </button>
          </div>

          {/* Option B: manual config */}
          <div className="space-y-4 border border-border bg-surface p-6 clip-corner">
            <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">
              {isFr ? "Option B: config manuelle" : "Option B: manual config"}
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
                {isFr ? "Fichier: " : "File: "} <span className="text-text">~/.codex/config.toml</span>
              </div>
            )}
            {mcpManualTarget === "claudeCode" && (
              <div className="text-xs font-mono text-subtle">
                {isFr ? "Fichier: " : "File: "} <span className="text-text">./.mcp.json</span>
              </div>
            )}
            {mcpManualTarget === "windsurf" && (
              <div className="text-xs font-mono text-subtle">
                {isFr ? "Fichier: " : "File: "} <span className="text-text">~/.codeium/windsurf/mcp_config.json</span>
              </div>
            )}
            {mcpManualTarget === "gemini" && (
              <div className="text-xs font-mono text-subtle">
                {isFr ? "Fichier: " : "File: "} <span className="text-text">~/.gemini/settings.json</span>
              </div>
            )}
            <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-bg p-3 overflow-x-auto">
              {mcpManualConfig}
            </pre>
            <button
              onClick={handleCopyMcpJson}
              className="border border-border px-2.5 py-1 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
            >
              {isFr ? "Copier config" : "Copy config"}
            </button>
          </div>
        </div>

        <button
          onClick={handleMcpDone}
          className="w-full h-12 font-bold uppercase tracking-wider text-sm border border-primary bg-primary text-bg hover:bg-text hover:text-bg transition-colors"
          data-testid="mcp-installed"
        >
          {isFr ? "J'ai installé" : "I've installed it"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Heading */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          {isFr ? "Connectez votre agent" : "Connect your agent"}
        </h1>
        <p className="text-sm font-mono text-subtle max-w-lg leading-relaxed">
          {isFr
            ? "Ton agent surveille les deals, négocie les offres et t'alerte quand ça compte. Tu gardes le contrôle — il fait le boulot."
            : "Your agent watches deals, negotiates offers, and alerts you when it matters. You stay in control — it does the work."}
        </p>
      </div>

      {/* Step 1 (optional): sign in */}
      {!hasOwnerSession && (
        <div className="space-y-3">
          <div className="text-[11px] font-mono text-subtle uppercase tracking-widest">
            {isFr ? "Étape 1 (optionnel)" : "Step 1 (optional)"}
          </div>
          <div className="border border-warning/30 bg-warning/5 p-4 clip-corner space-y-3">
            <div className="text-xs font-mono text-warning">
              {isFr
                ? "Sans compte, votre clé API sera limitée (recherches marketplace restreintes). Connectez-vous ou créez un compte pour profiter de toutes les fonctionnalités."
                : "Without an account, your API key will be limited (restricted marketplace searches). Log in or create an account to unlock full features."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/auth/login?next=/start"
                className="border border-primary bg-primary text-bg px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-text hover:border-text transition-colors"
              >
                {isFr ? "Se connecter" : "Log in"}
              </Link>
              <Link
                href="/auth/login?next=/start&mode=signup"
                className="border border-border px-4 py-2 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
              >
                {isFr ? "Créer un compte" : "Create account"}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 label (only when anonymous) */}
      {!hasOwnerSession && (
        <div className="text-[11px] font-mono text-subtle uppercase tracking-widest">
          {isFr ? "Étape 2 — Choisissez votre méthode" : "Step 2 — Choose your method"}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* API Key */}
        <div className="border border-border bg-surface p-6 space-y-4 clip-corner">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-xs font-mono font-bold uppercase border border-border text-subtle rounded">
                API
              </span>
            </div>
            <div className="text-sm font-bold tracking-wide">{isFr ? "Clé API manuelle" : "Manual API Key"}</div>
            <div className="text-xs font-mono text-subtle leading-relaxed">
              {isFr
                ? "Le plus simple pour commencer. Générez une clé ou collez une existante."
                : "The simplest way to get started. Generate a key or paste an existing one."}
            </div>
          </div>

          <div className="flex gap-1 bg-bg p-0.5 w-fit border border-border">
            <button
              onClick={() => setKeyMode("generate")}
              className={`px-3 py-1 text-xs font-bold uppercase tracking-widest ${
                keyMode === "generate" ? "bg-text text-bg" : "text-subtle hover:text-text"
              } transition-colors`}
            >
              {isFr ? "Générer" : "Generate"}
            </button>
            <button
              onClick={() => setKeyMode("paste")}
              className={`px-3 py-1 text-xs font-bold uppercase tracking-widest ${
                keyMode === "paste" ? "bg-text text-bg" : "text-subtle hover:text-text"
              } transition-colors`}
            >
              {isFr ? "J'ai une clé" : "I have a key"}
            </button>
          </div>

          {keyMode === "generate" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-mono text-subtle uppercase" htmlFor="connect-agent-name">
                  {isFr ? "Nom de l'agent (optionnel)" : "Agent name (optional)"}
                </label>
                <input
                  id="connect-agent-name"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder={isFr ? "Mon bot trading" : "My Trading Bot"}
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
                {keyStatus === "loading" ? (isFr ? "Génération..." : "Generating...") : (isFr ? "Générer" : "Generate")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-mono text-subtle uppercase" htmlFor="connect-paste-key">
                  {isFr ? "Clé API" : "API key"}
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
                {keyStatus === "loading" ? (isFr ? "Validation..." : "Validating...") : (isFr ? "Valider" : "Validate")}
              </button>
            </div>
          )}

          {keyMessage && (
            <div
              className={`text-xs font-mono ${
                keyStatus === "error" ? "text-error" : keyStatus === "success" ? "text-success" : "text-subtle"
              }`}
              aria-live="polite"
            >
              {keyMessage}
            </div>
          )}
        </div>

        {/* MCP */}
        <div className="border border-border bg-surface p-6 space-y-4 clip-corner">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-xs font-mono font-bold uppercase border border-border text-subtle rounded">
                MCP
              </span>
            </div>
            <div className="text-sm font-bold tracking-wide">{isFr ? "Connexion MCP" : "MCP Connection"}</div>
            <div className="text-xs font-mono text-subtle leading-relaxed">
              {isFr
                ? "Obtenez une clé API pour authentifier la connexion MCP."
                : "Get an API key to authenticate the MCP connection."}
            </div>
          </div>

          <div className="flex gap-1 bg-bg p-0.5 w-fit border border-border">
                <button
                  onClick={() => setMcpKeyMode("generate")}
                  className={`px-3 py-1 text-xs font-bold uppercase tracking-widest ${
                    mcpKeyMode === "generate" ? "bg-text text-bg" : "text-subtle hover:text-text"
                  } transition-colors`}
                >
                  {isFr ? "Générer" : "Generate"}
                </button>
                <button
                  onClick={() => setMcpKeyMode("paste")}
                  className={`px-3 py-1 text-xs font-bold uppercase tracking-widest ${
                    mcpKeyMode === "paste" ? "bg-text text-bg" : "text-subtle hover:text-text"
                  } transition-colors`}
                >
                  {isFr ? "J'ai une clé" : "I have a key"}
                </button>
              </div>

              {mcpKeyMode === "generate" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono text-subtle uppercase" htmlFor="mcp-agent-name">
                      {isFr ? "Nom de l'agent (optionnel)" : "Agent name (optional)"}
                    </label>
                    <input
                      id="mcp-agent-name"
                      value={mcpAgentName}
                      onChange={(e) => setMcpAgentName(e.target.value)}
                      placeholder={isFr ? "Mon bot trading" : "My Trading Bot"}
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
                    {mcpKeyStatus === "loading" ? (isFr ? "Génération..." : "Generating...") : (isFr ? "Générer" : "Generate")}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono text-subtle uppercase" htmlFor="mcp-paste-key">
                      {isFr ? "Clé API" : "API key"}
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
                    {mcpKeyStatus === "loading" ? (isFr ? "Validation..." : "Validating...") : (isFr ? "Valider" : "Validate")}
                  </button>
                </div>
              )}

              {mcpKeyMessage && (
                <div
                  className={`text-xs font-mono ${
                    mcpKeyStatus === "error" ? "text-error" : mcpKeyStatus === "success" ? "text-success" : "text-subtle"
                  }`}
                  aria-live="polite"
                >
                  {mcpKeyMessage}
                </div>
              )}

        </div>
      </div>

      {/* Separator */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs font-mono text-subtle uppercase tracking-widest">
          {isFr ? "Ou connecter un agent distant" : "Or connect a remote agent"}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Claim Link */}
      <div className="border border-secondary/30 bg-surface p-6 md:p-8 space-y-6 clip-corner">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          <div className="space-y-3 flex-1">
            <span className="inline-block px-2.5 py-1 text-xs font-mono font-bold uppercase border border-secondary/40 text-secondary rounded">
              {isFr ? "Équipes & multi-appareils" : "Teams & multi-device"}
            </span>
            <span className="inline-block px-2.5 py-1 text-xs font-mono font-bold uppercase border border-primary/40 text-primary rounded">
              {isFr ? "Auto-install agent" : "Agent self-install"}
            </span>
            <div className="text-lg font-bold tracking-wide">
              Claim Link
            </div>
            <div className="text-sm font-mono text-subtle leading-relaxed">
              {isFr
                ? "Connectez un agent qui tourne sur une autre machine (serveur, CI, bot). Générez un lien d'approbation, partagez-le par lien ou QR — l'agent reçoit sa clé API automatiquement, sans jamais la voir en clair. Votre agent peut aussi lancer ce flow lui-même."
                : "Connect an agent running on another machine (server, CI, bot). Generate an approval link, share it via link or QR — the agent receives its API key automatically, without ever seeing it in plain text. Your agent can also initiate this flow itself."}
            </div>
            <div className="text-xs font-mono text-muted bg-bg border border-border px-3 py-2 mt-2">
              {isFr ? "Astuce agent:" : "Agent tip:"}{" "}
              <code className="text-text">npx -y clawdeals-mcp setup</code>
              {" "}{isFr ? "ou" : "or"}{" "}
              <code className="text-text">clawdeals.connect.setup</code>
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
                ? (isFr ? "Création..." : "Creating...")
                : (isFr ? "Générer le lien" : "Generate Link")}
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
                  {isFr ? "Code de confirmation" : "Confirmation Code"}
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
                    {isFr ? "Valider maintenant" : "Approve now"}
                  </button>
                  <button
                    onClick={handleCopyClaimUrl}
                    className="border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
                  >
                    {claimCopied ? (isFr ? "Copié." : "Copied!") : (isFr ? "Copier le lien" : "Copy Link")}
                  </button>
                  <button
                    onClick={() => setClaimQrOpen((prev) => !prev)}
                    className="border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
                  >
                    {claimQrOpen ? (isFr ? "Masquer QR" : "Hide QR") : (isFr ? "Afficher QR" : "Show QR")}
                  </button>
                </div>
                <div className="text-xs font-mono text-subtle break-all">
                  {claimSession.claim_url}
                </div>
                <div className="text-xs font-mono text-muted">
                  {isFr
                    ? "Ouvrez la page de connexion sur cet appareil, ou partagez ce lien sur un autre appareil."
                    : "Open the claim page on this device, or share this link to another device."}
                </div>
                <div className="flex flex-wrap gap-3 text-xs font-mono text-muted">
                  <span>{isFr ? "Expire dans 10 min" : "Expires in 10 min"}</span>
                  <span className="text-border">|</span>
                  <span>{isFr ? "Révocable à tout moment" : "Revocable anytime"}</span>
                  <span className="text-border">|</span>
                  <span>{isFr ? "Aucune clé API à copier" : "No API key to copy"}</span>
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
                  {isFr ? "Scanner pour valider" : "Scan to approve"}
                </div>
                <QRCode
                  value={claimSession.claim_url}
                  size={172}
                  bgColor="transparent"
                  fgColor="currentColor"
                  className="text-text"
                />
                <div className="text-xs font-mono text-subtle text-center">
                  {isFr ? "Scannez depuis votre téléphone, puis confirmez le code " : "Scan from your phone, then confirm code "}
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
                  {isFr ? "En attente de validation..." : "Waiting for approval..."}
                </span>
              </div>
            )}

            {isClaimed && (
              <div className="flex items-center gap-2" aria-live="assertive">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
                </span>
                <span className="text-xs font-mono text-success">
                  {isFr ? "Validé. Connexion en cours..." : "Claimed! Connecting..."}
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
