import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import QRCode from "react-qr-code";

import { apiRequest } from "../api";
import { setStoredApiKey } from "../storage";
import { getPublicApiBaseUrl, joinUrl } from "../../../shared/urls";
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

function subscribeToNothing() {
  return () => {};
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
  onCreateSession
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
  const configuredApiBaseUrl = getPublicApiBaseUrl();
  const hostedApiBase = configuredApiBaseUrl
    ? joinUrl(configuredApiBaseUrl, "/api")
    : "https://app.clawdeals.com/api";
  const localApiBase = "http://localhost:3000/api";
  const baseUrl = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => "https://app.clawdeals.com"
  );
  const siteApiBase = joinUrl(baseUrl, "/api");
  const [mcpApiBase, setMcpApiBase] = useState(hostedApiBase);
  const [mcpShowInstall, setMcpShowInstall] = useState(false);
  const [mcpAdvancedOpen, setMcpAdvancedOpen] = useState(false);
  const [mcpManualTarget, setMcpManualTarget] = useState<
    "cursor" | "claude" | "claudeCode" | "codex" | "windsurf" | "gemini" | "generic"
  >("cursor");
  const [mcpCopyMsg, setMcpCopyMsg] = useState("");
  const optionChooseOneLabel = isFr
    ? "STEP_01: choisissez une seule option: A ou B."
    : "STEP_01: choose one option only: A or B.";
  const optionALabel = isFr ? "Option A (recommandee): installation auto" : "Option A (recommended): auto install";
  const optionBLabel = isFr ? "Option B (secours): config manuelle" : "Option B (fallback): manual config";

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

    if (mcpApiBase !== hostedApiBase) {
      env.CLAWDEALS_API_BASE = mcpApiBase;
    }

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
  }, [storedKey, mcpApiBase, hostedApiBase, mcpManualTarget]);

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
      setClaimError(err?.message || (isFr ? "Impossible de creer le lien de connexion." : "Failed to create claim link."));
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
      setClaimOpenMsg(isFr ? "Popup bloquee. Utilisez Copier le lien." : "Popup blocked. Use Copy Link instead.");
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
        setKeyMessage(isFr ? "Reponse serveur inattendue." : "Unexpected response from server.");
        return;
      }
      setStoredApiKey(apiKey);
      setKeyStatus("success");
      setKeyMessage(
        isFr
          ? "Cle API generee. Copiez-la maintenant: elle pourrait ne plus etre affichee."
          : "API key generated. Copy it now: it may not be shown again."
      );
      onApiKeySet(apiKey, agent_id);
      onMethodSelected("apikey");
    } catch (error: any) {
      setKeyStatus("error");
      setKeyMessage(error?.message || (isFr ? "Impossible de generer la cle API." : "Failed to generate API key."));
    }
  }, [agentName, isFr, onApiKeySet, onMethodSelected]);

  const handleValidate = useCallback(async () => {
    const key = pastedKey.trim();
    if (!key) {
      setKeyStatus("error");
      setKeyMessage(isFr ? "Collez une cle API." : "Paste an API key.");
      return;
    }
    if (!isLikelyApiKey(key)) {
      setKeyStatus("error");
      setKeyMessage(isFr ? "Cette cle ne ressemble pas a une cle API ClawDeals." : "This does not look like a ClawDeals API key.");
      return;
    }
    setKeyStatus("loading");
    setKeyMessage("");
    try {
      await apiRequest({ path: "/v1/deals?limit=1", method: "GET", apiKey: key });
      setStoredApiKey(key);
      setKeyStatus("success");
      setKeyMessage(isFr ? "Cle API validee." : "API key validated.");
      onApiKeySet(key);
      onMethodSelected("apikey");
    } catch (error: any) {
      setKeyStatus("error");
      setKeyMessage(error?.message || (isFr ? "Cle API invalide." : "Invalid API key."));
    }
  }, [pastedKey, isFr, onApiKeySet, onMethodSelected]);

  // --- MCP handlers ---
  const handleCopyMcpInstall = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMcpCopyMsg(isFr ? "Copie." : "Copied!");
      setTimeout(() => setMcpCopyMsg(""), 2000);
    } catch {
      setMcpCopyMsg(isFr ? "Echec de copie." : "Copy failed.");
    }
  }, [isFr]);

  const handleCopyMcpJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcpManualConfig);
      setMcpCopyMsg(isFr ? "Config copiee." : "Copied config!");
      setTimeout(() => setMcpCopyMsg(""), 2000);
    } catch {
      setMcpCopyMsg(isFr ? "Echec de copie." : "Copy failed.");
    }
  }, [isFr, mcpManualConfig]);

  const handleMcpDone = useCallback(() => {
    onMethodSelected("mcp");
  }, [onMethodSelected]);

  const isPolling = pollStatus === "polling";
  const isClaimed = pollStatus === "claimed";

  return (
    <div className="space-y-10">
      {/* Heading */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          {isFr ? "Connectez votre agent" : "Connect your agent"}
        </h1>
        <p className="text-subtle font-mono text-sm max-w-lg leading-relaxed">
          {isFr
            ? "Choisissez votre mode de connexion. Le lien de connexion est le plus rapide: aucune cle API a gerer, revocable a tout moment."
            : "Choose how to connect. The claim link is the fastest way - no API key to manage, revocable anytime."}
        </p>
      </div>

      {/* Hero: Claim Link (recommended) */}
      <div className="border border-secondary/30 bg-surface p-6 md:p-8 space-y-6 clip-corner">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="space-y-3 max-w-md">
            <span className="inline-block px-2.5 py-1 text-xs font-mono font-bold uppercase border border-secondary/40 text-secondary rounded">
              {isFr ? "Recommande" : "Recommended"}
            </span>
            <div className="text-lg font-bold tracking-wide">
              {isFr ? "Connexion via lien de connexion" : "Connect via Claim Link"}
            </div>
            <div className="text-sm font-mono text-subtle leading-relaxed">
              {isFr
                ? "Validez maintenant si vous etes sur cet appareil. Utilisez le lien ou le QR pour un autre appareil ou un coequipier."
                : "Approve now if you are on this device. Use link or QR for another device or teammate."}
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
                ? (isFr ? "Creation..." : "Creating...")
                : (isFr ? "Generer le lien de connexion" : "Generate Claim Link")}
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
                    {claimCopied ? (isFr ? "Copie." : "Copied!") : (isFr ? "Copier le lien" : "Copy Link")}
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
                  <span>{isFr ? "Revocable a tout moment" : "Revocable anytime"}</span>
                  <span className="text-border">|</span>
                  <span>{isFr ? "Aucune cle API a copier" : "No API key to copy"}</span>
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
                  {isFr ? "Scannez depuis votre telephone, puis confirmez le code " : "Scan from your phone, then confirm code "}
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
                  {isFr ? "Valide. Connexion en cours..." : "Claimed! Connecting..."}
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

      {/* Separator */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs font-mono text-subtle uppercase tracking-widest">
          {isFr ? "Ou choisir une autre methode" : "Or choose another method"}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Secondary: API Key + MCP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* API Key */}
        <div className="border border-border bg-surface p-6 space-y-4 clip-corner">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-xs font-mono font-bold uppercase border border-border text-subtle rounded">
                {isFr ? "Avance" : "Advanced"}
              </span>
            </div>
            <div className="text-sm font-bold tracking-wide">{isFr ? "Cle API manuelle" : "Manual API Key"}</div>
            <div className="text-xs font-mono text-subtle leading-relaxed">
              {isFr
                ? "Pour les developpeurs et scripts. Generez une nouvelle cle ou collez une cle existante."
                : "For developers and scripts. Generate a new key or paste an existing one."}
            </div>
          </div>

          <div className="flex gap-1 bg-bg p-0.5 w-fit border border-border">
            <button
              onClick={() => setKeyMode("generate")}
              className={`px-3 py-1 text-xs font-bold uppercase tracking-widest ${
                keyMode === "generate" ? "bg-text text-bg" : "text-subtle hover:text-text"
              } transition-colors`}
            >
              {isFr ? "Generer" : "Generate"}
            </button>
            <button
              onClick={() => setKeyMode("paste")}
              className={`px-3 py-1 text-xs font-bold uppercase tracking-widest ${
                keyMode === "paste" ? "bg-text text-bg" : "text-subtle hover:text-text"
              } transition-colors`}
            >
              {isFr ? "J'ai une cle" : "I have a key"}
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
                {keyStatus === "loading" ? (isFr ? "Generation..." : "Generating...") : (isFr ? "Generer" : "Generate")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-mono text-subtle uppercase" htmlFor="connect-paste-key">
                  {isFr ? "Cle API" : "API key"}
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

        {/* MCP / IDE */}
        <div className="border border-border bg-surface p-6 space-y-4 clip-corner">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-xs font-mono font-bold uppercase border border-border text-subtle rounded">
                IDE
              </span>
            </div>
            <div className="text-sm font-bold tracking-wide">{isFr ? "Connecter IDE" : "Connect IDE"}</div>
            <div className="text-xs font-mono text-subtle leading-relaxed">
              {isFr
                ? "Installation auto via npx: Cursor, Claude Desktop, Windsurf et Gemini. Pour Claude Code, Codex et autres clients, utilisez la config manuelle ci-dessous."
                : "Auto install via npx: Cursor, Claude Desktop, Windsurf, and Gemini. For Claude Code, Codex, and other clients, use the manual config below."}
            </div>
            <div className="text-[11px] font-mono text-subtle">{optionChooseOneLabel}</div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">{optionALabel}</div>
            <button
              onClick={() => setMcpShowInstall((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs font-mono text-primary hover:text-text transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform ${mcpShowInstall ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              {mcpShowInstall
                ? (isFr ? "Masquer la commande d'installation" : "Hide install command")
                : (isFr ? "Afficher la commande d'installation" : "Show install command")}
            </button>

            {mcpShowInstall && (
              <div className="space-y-3">
                <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-bg p-3 overflow-x-auto">
                  {mcpInstallSnippetNpx}
                </pre>
                <button
                  onClick={() => handleCopyMcpInstall(mcpInstallSnippetNpx)}
                  className="border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
                >
                  {isFr ? "Copier npx" : "Copy npx"}
                </button>
                {mcpCopyMsg && (
                  <span className="text-xs font-mono text-success">{mcpCopyMsg}</span>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleMcpDone}
            className="w-full h-10 font-bold uppercase tracking-wider text-xs border border-primary bg-primary text-bg hover:bg-text hover:text-bg transition-colors"
          >
            {isFr ? "J'ai installe" : "I've installed it"}
          </button>

          {/* Advanced accordion */}
          <button
            onClick={() => setMcpAdvancedOpen((prev) => !prev)}
            className="flex items-center gap-1.5 text-xs font-mono text-subtle hover:text-text transition-colors"
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
            {optionBLabel}
          </button>

          {mcpAdvancedOpen && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: isFr ? "Heberge" : "Hosted", value: hostedApiBase },
                  { label: isFr ? "Local (dev)" : "Local (dev only)", value: localApiBase },
                  { label: isFr ? "Ce site" : "This site", value: siteApiBase }
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setMcpApiBase(opt.value)}
                    className={`px-2.5 py-1 text-xs font-bold uppercase tracking-widest border ${
                      mcpApiBase === opt.value
                        ? "border-primary text-primary"
                        : "border-border text-subtle hover:border-border-strong hover:text-text"
                    } transition-colors`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {mcpApiBase === localApiBase && (
                <div className="text-xs font-mono text-warning">
                  {isFr
                    ? "La base locale fonctionne seulement si l'API Clawdeals tourne sur cette machine (`npm run dev`)."
                    : "Local base works only if you run Clawdeals API on this machine (`npm run dev`)."}
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-mono text-subtle uppercase">
                  {optionBLabel}
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
          )}
        </div>
      </div>
    </div>
  );
}
