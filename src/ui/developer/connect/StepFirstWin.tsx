import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

import { maskApiKey } from "../api";
import type { AgentMeResponse, ConnectLocale } from "./types";

function subscribeToNothing() {
  return () => {};
}

type Props = {
  locale: ConnectLocale;
  apiKey: string | null;
  agentMe: AgentMeResponse | null;
};

export default function StepFirstWin({ locale, apiKey, agentMe }: Props) {
  const isFr = locale === "fr";
  const baseUrl = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => "https://app.clawdeals.com"
  );

  const masked = apiKey ? maskApiKey(apiKey) : null;

  const curlSnippet = apiKey
    ? `curl -sS \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  "${baseUrl}/api/v1/deals?limit=10"`
    : null;

  const apiBase = `${baseUrl}/api`;
  const skillUrl = "https://clawdeals.com/skill.md";
  const openClawSnippet = apiKey
    ? `Skill URL: ${skillUrl}\nCLAWDEALS_API_BASE=${apiBase}\nCLAWDEALS_API_KEY=${apiKey}`
    : null;

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

      {/* Agent info summary */}
      {(agentMe || masked) && (
        <div className="border border-border bg-surface p-4 clip-corner">
          <div className="flex flex-wrap gap-4 text-xs font-mono">
            {agentMe?.agent_id && (
              <div>
                <span className="text-subtle">agent: </span>
                <span className="text-text">{agentMe.agent_id.slice(0, 8)}...</span>
              </div>
            )}
            {agentMe?.installation_id && (
              <div>
                <span className="text-subtle">install: </span>
                <span className="text-text">{agentMe.installation_id.slice(0, 8)}...</span>
              </div>
            )}
            {masked && (
              <div>
                <span className="text-subtle">key: </span>
                <span className="text-text">{masked}</span>
              </div>
            )}
            {agentMe?.oauth_scopes && agentMe.oauth_scopes.length > 0 && (
              <div>
                <span className="text-subtle">scopes: </span>
                <span className="text-text">{agentMe.oauth_scopes.join(", ")}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CTA cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </div>

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
