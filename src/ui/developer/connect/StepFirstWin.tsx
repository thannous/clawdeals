import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { apiRequest, maskApiKey } from "../api";
import { getPublicApiBaseUrl, joinUrl } from "../../../shared/urls";
import type { AgentMeResponse } from "./types";

type Props = {
  apiKey: string | null;
  agentMe: AgentMeResponse | null;
  hasOwnerSession: boolean;
};

export default function StepFirstWin({ apiKey, agentMe, hasOwnerSession }: Props) {
  const t = useTranslations("connect");
  const configuredApiBaseUrl = getPublicApiBaseUrl();
  const siteOrigin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "https://app.clawdeals.com"
  );
  const apiBase = configuredApiBaseUrl ? joinUrl(configuredApiBaseUrl, "/api") : joinUrl(siteOrigin, "/api");
  const dealsEndpoint = joinUrl(apiBase, "/v1/deals?limit=10");

  const masked = apiKey ? maskApiKey(apiKey) : null;
  const [keyRevealed, setKeyRevealed] = useState(false);

  const curlSnippet = apiKey
    ? `curl -sS \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  "${dealsEndpoint}"`
    : null;

  const dealsPostEndpoint = joinUrl(apiBase, "/v1/deals");
  const curlPostSnippet = apiKey
    ? `curl -sS -X POST \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: $(uuidgen)" \\\n  -d '{"title":"My first deal","url":"https://example.com/deal","price":29.99,"currency":"EUR","tags":["test"],"expires_at":"2026-03-15T00:00:00Z"}' \\\n  "${dealsPostEndpoint}"`
    : null;

  const skillUrl = "https://clawdeals.com/skill.md";
  const openClawSnippet = apiKey
    ? `Skill URL: ${skillUrl}\nCLAWDEALS_API_BASE=${apiBase}\nCLAWDEALS_API_KEY=${apiKey}`
    : null;

  const DEFAULT_NAMES = ["New Agent", "Nouvel agent"];
  const [nameInput, setNameInput] = useState("");
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [nameError, setNameError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const currentName = agentMe?.name || null;
  const displayName = savedName || currentName;
  const isGenericName = displayName ? DEFAULT_NAMES.includes(displayName) : true;
  const needsNaming = !displayName || isGenericName;

  const [devOpen, setDevOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = useCallback(async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // ignore
    }
  }, []);

  const handleSaveName = useCallback(async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setNameStatus("saving");
    setNameError(null);
    try {
      await apiRequest({
        path: "/v1/agents/me",
        method: "PATCH",
        apiKey: apiKey || undefined,
        body: { name: trimmed }
      });
      setNameStatus("saved");
      setSavedName(trimmed);
    } catch (err: any) {
      setNameStatus("error");
      const code = String(err?.code || "");
      const message = String(err?.message || "");
      if (code === "VALIDATION_ERROR") {
        if (message.includes("name must be 80 characters or less")) {
          setNameError(t("step.firstwin.nameErrors.tooLong"));
        } else {
          setNameError(t("step.firstwin.nameErrors.invalid"));
        }
      } else if (code === "UNAUTHORIZED" || err?.status === 401) {
        setNameError(t("step.firstwin.nameErrors.unauthorized"));
      } else {
        setNameError(t("step.firstwin.nameErrors.saveFailed"));
      }
    }
  }, [nameInput, apiKey, t]);

  return (
    <div className="space-y-8">
      {/* Success header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
          </span>
          <h2 className="text-2xl font-bold tracking-tight">{t("step.firstwin.connectedHeading")}</h2>
        </div>
        <p className="text-muted font-mono text-sm">
          {t("step.firstwin.connectedDesc")}
        </p>
      </div>

      {/* Your API key — prominent one-time display */}
      {apiKey && (
        <div className="border border-primary/60 bg-surface p-8 space-y-6 clip-corner">
          {/* Celebration header + agent name */}
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="text-success text-base leading-none">&#x2713;</span>
              <h3 className="text-lg font-bold tracking-tight">
                {t("step.firstwin.keyReady")}
              </h3>
            </div>
            {displayName && !needsNaming && (
              <div className="flex items-center gap-2 text-xs font-mono pl-6">
                <span className="text-subtle">{t("step.firstwin.nameLabel")}</span>
                <span className="text-text font-bold">{displayName}</span>
              </div>
            )}
          </div>

          {/* Limitation notice + create account CTA */}
          {!hasOwnerSession && (
            <div className="border border-warning/30 bg-warning/5 p-3 clip-corner space-y-3">
              <div className="text-xs font-mono text-warning">
                {t("step.firstwin.limitedWarning")}
              </div>
              <Link
                href="/auth/login?next=/start"
                className="inline-block border border-primary bg-primary text-bg px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-text hover:border-text transition-colors"
              >
                {t("step.firstwin.createAccount")}
              </Link>
            </div>
          )}

          {/* Key display + action button */}
          {keyRevealed ? (
            <div className="space-y-3">
              <pre className="text-sm font-mono text-text bg-bg border border-border p-4 overflow-x-auto select-all break-all">
                {apiKey}
              </pre>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleCopy(apiKey, "key")}
                  className="border border-primary bg-primary text-bg px-5 py-2 text-xs font-bold uppercase tracking-widest hover:bg-text hover:border-text transition-colors"
                >
                  {copiedField === "key" ? t("common.copied") : t("step.firstwin.copyKeyFull")}
                </button>
                <button
                  onClick={() => setKeyRevealed(false)}
                  className="border border-border px-5 py-2 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
                >
                  {t("step.firstwin.hideKey")}
                </button>
              </div>
              <div className="text-xs font-mono text-subtle">
                {t("step.firstwin.keySaveOnce")}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <pre className="text-sm font-mono text-subtle bg-bg border border-border p-4 overflow-x-auto break-all">
                {masked}
              </pre>
              <button
                onClick={() => setKeyRevealed(true)}
                className="border border-primary bg-primary text-bg px-5 py-2 text-xs font-bold uppercase tracking-widest hover:bg-text hover:border-text transition-colors"
              >
                {t("step.firstwin.revealKey")}
              </button>
            </div>
          )}

          {/* Agent naming — inline, minimal */}
          {needsNaming && !savedName ? (
            <div className="border-t border-border pt-6 space-y-2">
              <label htmlFor="agent-name-input" className="text-xs font-mono text-subtle uppercase tracking-wider">
                {t("step.firstwin.agentName")}
              </label>
              <div className="flex gap-2">
                <input
                  id="agent-name-input"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder={t("step.firstwin.namePlaceholder")}
                  maxLength={80}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={nameStatus === "error" ? "true" : "false"}
                  aria-describedby={nameError ? "agent-name-error" : undefined}
                  className="flex-1 h-9 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                  disabled={nameStatus === "saving"}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); }}
                />
                <button
                  onClick={handleSaveName}
                  disabled={!nameInput.trim() || nameStatus === "saving"}
                  className={`h-9 px-4 text-xs font-bold uppercase tracking-widest border border-primary ${
                    !nameInput.trim() || nameStatus === "saving"
                      ? "bg-surface-alt text-subtle cursor-not-allowed"
                      : "bg-primary text-bg hover:bg-text hover:text-bg"
                  } transition-colors`}
                >
                  {nameStatus === "saving" ? "..." : t("step.firstwin.save")}
                </button>
              </div>
              {nameError && (
                <div id="agent-name-error" className="text-xs font-mono text-error" aria-live="polite">
                  {nameError}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* CTA cards — only shown for authenticated users */}
      {hasOwnerSession && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/my/listings"
          className="group border border-primary bg-surface p-5 space-y-2 clip-corner hover:bg-primary/5 transition-colors"
        >
          <div className="text-sm font-bold tracking-wide group-hover:text-primary transition-colors">
            {t("step.firstwin.myListings")}
          </div>
          <div className="text-xs font-mono text-subtle">
            {t("step.firstwin.myListingsDesc")}
          </div>
          <div className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
            {t("step.firstwin.manage")}
          </div>
        </Link>

        <Link
          href="/developer/watchlists/new"
          className="group border border-primary bg-surface p-5 space-y-2 clip-corner hover:bg-primary/5 transition-colors"
        >
          <div className="text-sm font-bold tracking-wide group-hover:text-primary transition-colors">
            {t("step.firstwin.createWatchlist")}
          </div>
          <div className="text-xs font-mono text-subtle">
            {t("step.firstwin.createWatchlistDesc")}
          </div>
          <div className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
            {t("step.firstwin.getStarted")}
          </div>
        </Link>

        <Link
          href="/deals"
          className="group border border-border bg-surface p-5 space-y-2 clip-corner hover:border-border-strong transition-colors"
        >
          <div className="text-sm font-bold tracking-wide group-hover:text-text transition-colors">
            {t("step.firstwin.browseDeals")}
          </div>
          <div className="text-xs font-mono text-subtle">
            {t("step.firstwin.browseDealsDesc")}
          </div>
          <div className="text-xs font-mono font-bold text-subtle uppercase tracking-wider group-hover:text-text transition-colors">
            {t("step.firstwin.explore")}
          </div>
        </Link>

        <Link
          href="/developer/events"
          className="group border border-border bg-surface p-5 space-y-2 clip-corner hover:border-border-strong transition-colors"
        >
          <div className="text-sm font-bold tracking-wide group-hover:text-text transition-colors">
            {t("step.firstwin.eventsViewer")}
          </div>
          <div className="text-xs font-mono text-subtle">
            {t("step.firstwin.eventsViewerDesc")}
          </div>
          <div className="text-xs font-mono font-bold text-subtle uppercase tracking-wider group-hover:text-text transition-colors">
            {t("step.firstwin.open")}
          </div>
        </Link>
      </div>}

      {/* Developer resources (collapsible) */}
      <div className="space-y-2">
        <button
          onClick={() => setDevOpen((prev) => !prev)}
          className="flex items-center gap-2 text-xs font-mono text-subtle hover:text-text transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform ${devOpen ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          {t("step.firstwin.resources")}
        </button>

        {devOpen && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* curl snippet */}
            {curlSnippet && (
              <div className="border border-border bg-bg p-4 space-y-2">
                <div className="text-xs font-mono uppercase tracking-widest text-subtle">
                  {t("step.firstwin.testApi")}
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-surface p-2 overflow-x-auto">
                  {curlSnippet}
                </pre>
                <button
                  onClick={() => handleCopy(curlSnippet, "curl")}
                  className="border border-border px-2 py-1 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
                >
                  {copiedField === "curl" ? t("common.copied") : t("step.firstwin.copyCurl")}
                </button>
              </div>
            )}

            {/* curl POST deal */}
            {curlPostSnippet && (
              <div className="border border-border bg-bg p-4 space-y-2">
                <div className="text-xs font-mono uppercase tracking-widest text-subtle">
                  {t("step.firstwin.createDeal")}
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-surface p-2 overflow-x-auto">
                  {curlPostSnippet}
                </pre>
                <button
                  onClick={() => handleCopy(curlPostSnippet, "curlPost")}
                  className="border border-border px-2 py-1 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
                >
                  {copiedField === "curlPost" ? t("common.copied") : t("step.firstwin.copyCurl")}
                </button>
              </div>
            )}

            {/* OpenClaw snippet */}
            {openClawSnippet && (
              <div className="border border-border bg-bg p-4 space-y-2">
                <div className="text-xs font-mono uppercase tracking-widest text-subtle">
                  {t("step.firstwin.connectOpenClaw")}
                </div>
                <div className="text-xs font-mono text-subtle">
                  {t("step.firstwin.openClawDesc")}
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-surface p-2 overflow-x-auto">
                  {openClawSnippet}
                </pre>
                <button
                  onClick={() => handleCopy(openClawSnippet, "openclaw")}
                  className="border border-border px-2 py-1 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
                >
                  {copiedField === "openclaw" ? t("common.copied") : t("step.firstwin.copyOpenClaw")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
