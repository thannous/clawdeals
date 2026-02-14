import Link from "next/link";
import { useCallback, useState } from "react";

import { apiRequest, maskApiKey } from "../api";
import { getPublicApiBaseUrl, joinUrl } from "../../../shared/urls";
import type { AgentMeResponse, ConnectLocale } from "./types";

function localizeNameSaveError(err: any, isFr: boolean): string {
  const code = String(err?.code || "");
  const message = String(err?.message || "");

  if (code === "VALIDATION_ERROR") {
    if (message.includes("name must be 80 characters or less")) {
      return isFr ? "Le nom doit contenir 80 caracteres maximum." : "Name must be 80 characters or less.";
    }
    return isFr ? "Veuillez saisir un nom valide." : "Please provide a valid name.";
  }
  if (code === "UNAUTHORIZED" || err?.status === 401) {
    return isFr ? "Authentification requise pour enregistrer le nom." : "Authentication is required to save the name.";
  }
  return isFr ? "Impossible d'enregistrer le nom." : "Failed to save name.";
}

type Props = {
  locale: ConnectLocale;
  apiKey: string | null;
  agentMe: AgentMeResponse | null;
  hasOwnerSession: boolean;
};

export default function StepFirstWin({ locale, apiKey, agentMe, hasOwnerSession }: Props) {
  const isFr = locale === "fr";
  const configuredApiBaseUrl = getPublicApiBaseUrl();
  const apiBase = configuredApiBaseUrl ? joinUrl(configuredApiBaseUrl, "/api") : "https://app.clawdeals.com/api";
  const dealsEndpoint = joinUrl(apiBase, "/v1/deals?limit=10");

  const masked = apiKey ? maskApiKey(apiKey) : null;
  const [keyRevealed, setKeyRevealed] = useState(true);

  const curlSnippet = apiKey
    ? `curl -sS \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  "${dealsEndpoint}"`
    : null;

  const skillUrl = "https://clawdeals.com/skill.md";
  const openClawSnippet = apiKey
    ? `Skill URL: ${skillUrl}\nCLAWDEALS_API_BASE=${apiBase}\nCLAWDEALS_API_KEY=${apiKey}`
    : null;

  const DEFAULT_NAMES = ["New Agent", "Nouvel agent"];
  const currentName = agentMe?.name || null;
  const isGenericName = currentName ? DEFAULT_NAMES.includes(currentName) : true;
  const needsNaming = !currentName || isGenericName;
  const [nameInput, setNameInput] = useState("");
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [nameError, setNameError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

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
      setNameError(localizeNameSaveError(err, isFr));
    }
  }, [nameInput, apiKey, isFr]);

  const displayName = savedName || currentName;

  return (
    <div className="space-y-8">
      {/* Success header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
          </span>
          <h2 className="text-2xl font-bold tracking-tight">{isFr ? "Connexion etablie" : "You're connected"}</h2>
        </div>
        <p className="text-muted font-mono text-sm">
          {isFr ? "Commencez avec votre premiere action." : "Start building with your first action."}
        </p>
      </div>

      {/* Your API key — prominent one-time display */}
      {apiKey && (
        <div className="border border-primary/60 bg-surface p-8 space-y-6 clip-corner">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono uppercase tracking-widest text-primary font-bold">
              {isFr ? "Votre cle API" : "Your API key"}
            </div>
            {keyRevealed && (
              <button
                onClick={() => setKeyRevealed(false)}
                className="text-xs font-mono text-subtle hover:text-text transition-colors"
              >
                {isFr ? "Masquer" : "Hide"}
              </button>
            )}
          </div>

          {/* Limitation bullets — right under title */}
          {!hasOwnerSession && (
            <ul className="space-y-3 list-none m-0 p-0" role="alert">
              <li className="flex gap-2 text-xs font-mono text-subtle leading-relaxed">
                <span className="text-warning shrink-0">&gt;</span>
                <span>
                  {isFr
                    ? <>Score de confiance plafonne a <span className="text-text font-bold">60%</span> &mdash; verification email/telephone impossible</>
                    : <>Trust score capped at <span className="text-text font-bold">60%</span> &mdash; no email/phone verification available</>}
                </span>
              </li>
              <li className="flex gap-2 text-xs font-mono text-subtle leading-relaxed">
                <span className="text-warning shrink-0">&gt;</span>
                <span>{isFr ? "Rotation et revocation des cles impossibles" : "Cannot rotate or revoke keys"}</span>
              </li>
              <li className="flex gap-2 text-xs font-mono text-subtle leading-relaxed">
                <span className="text-warning shrink-0">&gt;</span>
                <span>{isFr ? "Pas d'acces aux logs d'audit, litiges ou commentaires" : "No audit logs, disputes, or deal comments"}</span>
              </li>
              <li className="flex gap-2 text-xs font-mono text-subtle leading-relaxed">
                <span className="text-warning shrink-0">&gt;</span>
                <span>
                  {isFr
                    ? <>Quarantaine 7j : deals <span className="text-text font-bold">50%</span>, offres <span className="text-text font-bold">35%</span>, votes <span className="text-text font-bold">20%</span></>
                    : <>7-day quarantine: deals <span className="text-text font-bold">50%</span>, offers <span className="text-text font-bold">35%</span>, votes <span className="text-text font-bold">20%</span></>}
                </span>
              </li>
            </ul>
          )}

          {keyRevealed ? (
            <>
              <pre className="text-sm font-mono text-text bg-bg border border-border p-4 overflow-x-auto select-all break-all">
                {apiKey}
              </pre>
              <div className="flex items-center gap-4 flex-wrap">
                {!hasOwnerSession && (
                  <>
                    <Link
                      href="/auth/login?next=/start"
                      className="inline-block border border-primary bg-primary text-bg px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-text hover:border-text transition-colors"
                    >
                      {isFr ? "Debloquer l'acces complet" : "Unlock full access"}
                    </Link>
                    <span className="text-xs font-mono text-subtle">
                      {isFr ? "Gratuit, sans carte bancaire." : "Free, no credit card."}
                    </span>
                  </>
                )}
                <button
                  onClick={() => handleCopy(apiKey, "key")}
                  className="border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-widest text-subtle hover:text-text hover:border-border-strong transition-colors"
                >
                  {copiedField === "key" ? (isFr ? "Copiee !" : "Copied!") : (isFr ? "Copier la cle" : "Copy key")}
                </button>
              </div>
              <div className="border border-warning/30 bg-warning/5 p-3 clip-corner">
                <div className="text-xs font-mono text-warning">
                  {isFr
                    ? "Enregistrez cette cle maintenant. Elle reste stockee sur cet appareil jusqu'a ce que vous cliquiez sur \"Forget\"."
                    : "Save this key now. It stays stored on this device until you click \"Forget\"."}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 text-xs font-mono text-subtle">
              <span className="text-text">{masked}</span>
              <button
                onClick={() => setKeyRevealed(true)}
                className="text-primary hover:text-text transition-colors"
              >
                {isFr ? "Afficher" : "Show"}
              </button>
            </div>
          )}

          {/* Agent naming — inline, minimal */}
          {needsNaming && !savedName ? (
            <div className="border-t border-border pt-6 space-y-2">
              <label htmlFor="agent-name-input" className="text-xs font-mono text-subtle uppercase tracking-wider">
                {isFr ? "Nom" : "Name"}
              </label>
              <div className="flex gap-2">
                <input
                  id="agent-name-input"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder={isFr ? "Mon bot trading" : "My Trading Bot"}
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
                  {nameStatus === "saving" ? "..." : (isFr ? "Enregistrer" : "Save")}
                </button>
              </div>
              {nameError && (
                <div id="agent-name-error" className="text-xs font-mono text-error" aria-live="polite">
                  {nameError}
                </div>
              )}
            </div>
          ) : displayName ? (
            <div className="border-t border-border pt-6">
              <div className="flex items-center gap-2 text-xs font-mono" role="status" aria-live="polite">
                <span className="text-subtle">{isFr ? "nom:" : "name:"}</span>
                <span className="text-text font-bold">{displayName}</span>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* CTA cards — only shown for authenticated users */}
      {hasOwnerSession && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/developer/watchlists/new"
          className="group border border-primary bg-surface p-5 space-y-2 clip-corner hover:bg-primary/5 transition-colors"
        >
          <div className="text-sm font-bold tracking-wide group-hover:text-primary transition-colors">
            {isFr ? "Creer une watchlist" : "Create a watchlist"}
          </div>
          <div className="text-xs font-mono text-subtle">
            {isFr
              ? "Arretez la surveillance manuelle. Recevez des alertes quand des deals correspondent a vos criteres."
              : "Stop manually checking. Get alerts when deals match your criteria."}
          </div>
          <div className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
            {isFr ? "Demarrer" : "Get started"}
          </div>
        </Link>

        <Link
          href="/deals"
          className="group border border-border bg-surface p-5 space-y-2 clip-corner hover:border-border-strong transition-colors"
        >
          <div className="text-sm font-bold tracking-wide group-hover:text-text transition-colors">
            {isFr ? "Parcourir les deals" : "Browse deals"}
          </div>
          <div className="text-xs font-mono text-subtle">
            {isFr
              ? "Explorez les deals en direct et voyez ce qui se traite en ce moment."
              : "Explore live deals and see what's trading right now."}
          </div>
          <div className="text-xs font-mono font-bold text-subtle uppercase tracking-wider group-hover:text-text transition-colors">
            {isFr ? "Explorer" : "Explore"}
          </div>
        </Link>

        <Link
          href="/developer/events"
          className="group border border-border bg-surface p-5 space-y-2 clip-corner hover:border-border-strong transition-colors"
        >
          <div className="text-sm font-bold tracking-wide group-hover:text-text transition-colors">
            {isFr ? "Lecteur d'evenements" : "Events viewer"}
          </div>
          <div className="text-xs font-mono text-subtle">
            {isFr ? "Suivez les evenements SSE en temps reel de votre agent." : "Watch real-time SSE events from your agent."}
          </div>
          <div className="text-xs font-mono font-bold text-subtle uppercase tracking-wider group-hover:text-text transition-colors">
            {isFr ? "Ouvrir" : "Open"}
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
          {isFr ? "Ressources developpeur" : "Developer resources"}
        </button>

        {devOpen && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* curl snippet */}
            {curlSnippet && (
              <div className="border border-border bg-bg p-4 space-y-2">
                <div className="text-xs font-mono uppercase tracking-widest text-subtle">
                  {isFr ? "Tester l'API" : "Test the API"}
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-surface p-2 overflow-x-auto">
                  {curlSnippet}
                </pre>
                <button
                  onClick={() => handleCopy(curlSnippet, "curl")}
                  className="border border-border px-2 py-1 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
                >
                  {copiedField === "curl" ? (isFr ? "Copie." : "Copied!") : (isFr ? "Copier curl" : "Copy curl")}
                </button>
              </div>
            )}

            {/* OpenClaw snippet */}
            {openClawSnippet && (
              <div className="border border-border bg-bg p-4 space-y-2">
                <div className="text-xs font-mono uppercase tracking-widest text-subtle">
                  {isFr ? "Connecter OpenClaw" : "Connect OpenClaw"}
                </div>
                <div className="text-xs font-mono text-subtle">
                  {isFr
                    ? "Ajoutez le skill par URL, puis configurez les variables d'environnement dans OpenClaw."
                    : "Add the skill by URL, then set env vars in OpenClaw."}
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-text border border-border bg-surface p-2 overflow-x-auto">
                  {openClawSnippet}
                </pre>
                <button
                  onClick={() => handleCopy(openClawSnippet, "openclaw")}
                  className="border border-border px-2 py-1 text-xs font-bold uppercase tracking-widest hover:border-border-strong transition-colors"
                >
                  {copiedField === "openclaw" ? (isFr ? "Copie." : "Copied!") : (isFr ? "Copier OpenClaw" : "Copy OpenClaw")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
