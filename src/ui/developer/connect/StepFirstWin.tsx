import Link from "next/link";
import { useReducer, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { apiRequest, maskApiKey } from "../api";
import { getPublicApiBaseUrl, joinUrl } from "../../../shared/urls";
import type { AgentMeResponse } from "./types";
import FirstMissionCard from "./FirstMissionCard";

type Props = {
  apiKey: string | null;
  agentMe: AgentMeResponse | null;
  hasOwnerSession: boolean;
};

type FirstWinState = {
  keyRevealed: boolean;
  nameInput: string;
  nameStatus: "idle" | "saving" | "saved" | "error";
  nameError: string | null;
  savedName: string | null;
  devOpen: boolean;
  copiedField: string | null;
};

type FirstWinAction = {
  type: "patch";
  patch: Partial<FirstWinState>;
};

const INITIAL_STATE: FirstWinState = {
  keyRevealed: false,
  nameInput: "",
  nameStatus: "idle",
  nameError: null,
  savedName: null,
  devOpen: false,
  copiedField: null
};

function firstWinReducer(state: FirstWinState, action: FirstWinAction): FirstWinState {
  if (action.type === "patch") {
    return { ...state, ...action.patch };
  }
  return state;
}

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
  const [state, dispatch] = useReducer(firstWinReducer, INITIAL_STATE);

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
  const currentName = agentMe?.name || null;
  const displayName = state.savedName || currentName;
  const isGenericName = displayName ? DEFAULT_NAMES.includes(displayName) : true;
  const needsNaming = !displayName || isGenericName;

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      dispatch({ type: "patch", patch: { copiedField: field } });
      setTimeout(() => dispatch({ type: "patch", patch: { copiedField: null } }), 2000);
    } catch {
      // ignore
    }
  };

  const handleSaveName = async () => {
    const trimmed = state.nameInput.trim();
    if (!trimmed) return;
    dispatch({ type: "patch", patch: { nameStatus: "saving", nameError: null } });
    try {
      await apiRequest({
        path: "/v1/agents/me",
        method: "PATCH",
        apiKey: apiKey || undefined,
        body: { name: trimmed }
      });
      dispatch({
        type: "patch",
        patch: {
          nameStatus: "saved",
          savedName: trimmed
        }
      });
    } catch (err: any) {
      let nextError = t("step.firstwin.nameErrors.saveFailed");
      const code = String(err?.code || "");
      const message = String(err?.message || "");
      if (code === "VALIDATION_ERROR") {
        if (message.includes("name must be 80 characters or less")) {
          nextError = t("step.firstwin.nameErrors.tooLong");
        } else {
          nextError = t("step.firstwin.nameErrors.invalid");
        }
      } else if (code === "UNAUTHORIZED" || err?.status === 401) {
        nextError = t("step.firstwin.nameErrors.unauthorized");
      }
      dispatch({
        type: "patch",
        patch: {
          nameStatus: "error",
          nameError: nextError
        }
      });
    }
  };

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

          {/* Key display + action button */}
          {state.keyRevealed ? (
            <div className="space-y-3">
              <pre className="text-sm font-mono text-text bg-bg border border-border p-4 overflow-x-auto select-all break-all">
                {apiKey}
              </pre>
              <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleCopy(apiKey, "key")}
                    className="border border-primary bg-primary text-bg px-5 py-2 text-xs font-bold uppercase tracking-widest hover:bg-text hover:border-text transition-colors"
                  >
                    {state.copiedField === "key" ? t("common.copied") : t("step.firstwin.copyKeyFull")}
                  </button>
                  <button
                    onClick={() => dispatch({ type: "patch", patch: { keyRevealed: false } })}
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
                onClick={() => dispatch({ type: "patch", patch: { keyRevealed: true } })}
                className="border border-primary bg-primary text-bg px-5 py-2 text-xs font-bold uppercase tracking-widest hover:bg-text hover:border-text transition-colors"
              >
                {t("step.firstwin.revealKey")}
              </button>
            </div>
          )}

          {/* Agent naming — inline, minimal */}
          {needsNaming && !state.savedName ? (
            <div className="border-t border-border pt-6 space-y-2">
              <label htmlFor="agent-name-input" className="text-xs font-mono text-subtle uppercase tracking-wider">
                {t("step.firstwin.agentName")}
              </label>
              <div className="flex gap-2">
                <input
                  id="agent-name-input"
                  value={state.nameInput}
                  onChange={(e) => dispatch({ type: "patch", patch: { nameInput: e.target.value } })}
                  placeholder={t("step.firstwin.namePlaceholder")}
                  maxLength={80}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={state.nameStatus === "error" ? "true" : "false"}
                  aria-describedby={state.nameError ? "agent-name-error" : undefined}
                  className="flex-1 h-9 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                  disabled={state.nameStatus === "saving"}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); }}
                />
                <button
                  onClick={handleSaveName}
                  disabled={!state.nameInput.trim() || state.nameStatus === "saving"}
                  className={`h-9 px-4 text-xs font-bold uppercase tracking-widest border border-primary ${
                    !state.nameInput.trim() || state.nameStatus === "saving"
                      ? "bg-surface-alt text-subtle cursor-not-allowed"
                      : "bg-primary text-bg hover:bg-text hover:text-bg"
                  } transition-colors`}
                >
                  {state.nameStatus === "saving" ? "..." : t("step.firstwin.save")}
                </button>
              </div>
              {state.nameError && (
                <div id="agent-name-error" className="text-xs font-mono text-error" aria-live="polite">
                  {state.nameError}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* The first win itself: a real mission on a real listing, key in hand */}
      {apiKey ? <FirstMissionCard /> : null}

      {/* Account comes after the value, framed as what it unlocks */}
      {!hasOwnerSession && (
        <div className="border border-border bg-surface-alt p-4 clip-corner space-y-3" data-testid="firstwin-account-unlock">
          <div className="text-xs text-muted leading-relaxed">
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
          onClick={() => dispatch({ type: "patch", patch: { devOpen: !state.devOpen } })}
          className="flex items-center gap-2 text-xs font-mono text-subtle hover:text-text transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform ${state.devOpen ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          {t("step.firstwin.resources")}
        </button>

        {state.devOpen && (
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
                  {state.copiedField === "curl" ? t("common.copied") : t("step.firstwin.copyCurl")}
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
                  {state.copiedField === "curlPost" ? t("common.copied") : t("step.firstwin.copyCurl")}
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
                  {state.copiedField === "openclaw" ? t("common.copied") : t("step.firstwin.copyOpenClaw")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
