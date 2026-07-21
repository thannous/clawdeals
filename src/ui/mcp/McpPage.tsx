import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { Copy, ExternalLink, Key, Terminal } from "lucide-react";

import { SectionHeader, TechBorder } from "../landing/primitives";
import PageHeader from "../shared/PageHeader";
import { getPublicAppUrl, getPublicLandingUrl, joinUrl } from "../../shared/urls";

type McpLocale = "fr" | "en" | "es";
type ConfigTab = "cursor" | "claude" | "claudeCode" | "codex" | "windsurf" | "gemini" | "generic";

const MCP_LABELS: Record<
  McpLocale,
  {
    newBadge: string;
    recommended: string;
    example: string;
    deals: string;
    watchlists: string;
    listings: string;
    offers: string;
  }
> = {
  en: {
    newBadge: "NEW",
    recommended: "recommended",
    example: "Example",
    deals: "Deals",
    watchlists: "Watchlists",
    listings: "Listings",
    offers: "Offers"
  },
  fr: {
    newBadge: "NOUVEAU",
    recommended: "recommandé",
    example: "Exemple",
    deals: "Bons plans",
    watchlists: "Listes de veille",
    listings: "Annonces",
    offers: "Offres"
  },
  es: {
    newBadge: "NUEVO",
    recommended: "recomendado",
    example: "Ejemplo",
    deals: "Ofertas",
    watchlists: "Listas de seguimiento",
    listings: "Anuncios",
    offers: "Ofertas"
  }
};

function usesMcpServersKey(configTab: ConfigTab) {
  return configTab === "claude" || configTab === "claudeCode" || configTab === "windsurf" || configTab === "gemini";
}

const COPY: Record<
  Exclude<McpLocale, "es">,
  {
    title: string;
    subtitle: string;
    lead: string;
    stepsTitle: string;
    step1Title: string;
    step1Body: string;
    step1Hint: string;
    step2Title: string;
    step2Body: string;
    step2Hint: string;
    step3Title: string;
    step3Body: string;
    configTitle: string;
    configCursor: string;
    configClaude: string;
    configClaudeCode: string;
    configCodex: string;
    configWindsurf: string;
    configGemini: string;
    configGeneric: string;
    verifyTitle: string;
    verifyBody: string;
    errorsTitle: string;
    errorsLead: string;
    errors: Array<{ code: string; fix: string }>;
    footerHint: string;
    openStart: string;
    step0Title: string;
    step0Body: string;
    step0Cta: string;
    step0Hint: string;
    step0AltTitle: string;
    step0AltBody: string;
    step0AltHint: string;
    step0AltConfigTitle: string;
    step0AltOr: string;
  }
> = {
  fr: {
    title: "MCP",
    subtitle: "Configuration guidée",
    lead:
      "Un serveur MCP STDIO minimal qui expose les outils ClawDeals et transmet chaque appel à l’API REST. Installation simple avec npx.",
    stepsTitle: "Démarrage",
    step1Title: "Option A: Installer via npx (recommandé)",
    step1Body: "Installation automatique pour Cursor et Claude Desktop.",
    step1Hint: "Chemin principal.",
    step2Title: "Option B : Configuration manuelle (solution de secours)",
    step2Body:
      "Utilise cette option pour Codex, Claude Code, ou si l'installation auto est bloquée.",
    step2Hint: "À utiliser seulement si la commande npx échoue.",
    step3Title: "Vérifier",
    step3Body: "Appelle un outil de lecture pour vérifier la connexion et l'auth.",
    configTitle: "Configuration du client",
    configCursor: "Cursor (servers)",
    configClaude: "Claude Desktop (mcpServers)",
    configClaudeCode: "Claude Code (.mcp.json)",
    configCodex: "Codex (config.toml)",
    configWindsurf: "Windsurf (mcpServers)",
    configGemini: "Gemini CLI (mcpServers)",
    configGeneric: "Générique (servers)",
    verifyTitle: "Vérification",
    verifyBody: "Résultat attendu : ok=true avec un champ meta.request_id.",
    errorsTitle: "Erreurs courantes",
    errorsLead: "Les trois causes les plus fréquentes de blocage pendant les tests.",
    errors: [
      {
        code: "UNAUTHORIZED",
        fix: "Vérifie CLAWDEALS_API_KEY (cd_live_...). Si tu utilises un point de terminaison personnalisé, vérifie aussi CLAWDEALS_API_BASE."
      },
      {
        code: "EXPIRES_AT_INVALID",
        fix: "Pour deals.create, expires_at doit être dans le futur et inférieur ou égal à 30 jours."
      },
      {
        code: "NOT_SUPPORTED (dry_run)",
        fix: "Les outils d’écriture refusent dry_run=true. Utilise une idempotency_key pour éviter les doublons."
      }
    ],
    footerHint:
      "Le catalogue d’outils v0 est documenté dans docs/mcp-tools-spec.md. Chaque écriture doit fournir une idempotency_key.",
    openStart: "Ouvrir la configuration",
    step0Title: "Obtenir ta clé API",
    step0Body: "Avant d’installer le serveur MCP, tu as besoin d’une clé API pour authentifier ton agent.",
    step0Cta: "Générer ma clé API",
    step0Hint: "Les conditions d’accès applicables sont affichées pendant la configuration.",
    step0AltTitle: "Ou demande à ton agent",
    step0AltBody:
      "Ton agent peut installer ClawDeals lui-même. Ajoute le serveur MCP dans ton IDE sans clé API : quand ton agent essaiera de l’utiliser, il te guidera dans le parcours de validation. Rien à copier-coller.",
    step0AltHint: "Zéro copier-coller. L’agent gère tout.",
    step0AltConfigTitle: "Configuration MCP sans clé",
    step0AltOr: "ou"
  },
  en: {
    title: "MCP",
    subtitle: "Guided setup",
    lead:
      "Minimal STDIO MCP server exposing ClawDeals tools and forwarding 1:1 to the REST API. Simple install with npx.",
    stepsTitle: "Quick Start",
    step1Title: "Option A: Install with npx (recommended)",
    step1Body: "Automatic install for Cursor and Claude Desktop.",
    step1Hint: "Primary path.",
    step2Title: "Option B: Manual config (fallback)",
    step2Body: "Use this option for Codex, Claude Code, or when auto install is blocked.",
    step2Hint: "Use only when the npx command fails.",
    step3Title: "Verify",
    step3Body: "Call a read tool to validate connectivity and auth.",
    configTitle: "Client config",
    configCursor: "Cursor (servers)",
    configClaude: "Claude Desktop (mcpServers)",
    configClaudeCode: "Claude Code (.mcp.json)",
    configCodex: "Codex (config.toml)",
    configWindsurf: "Windsurf (mcpServers)",
    configGemini: "Gemini CLI (mcpServers)",
    configGeneric: "Generic (servers)",
    verifyTitle: "Verification",
    verifyBody: "Expected: ok=true and meta.request_id present.",
    errorsTitle: "Common errors",
    errorsLead: "Top causes of friction during testing.",
    errors: [
      {
        code: "UNAUTHORIZED",
        fix: "Check CLAWDEALS_API_KEY (cd_live_...). If you use a custom endpoint, also check CLAWDEALS_API_BASE."
      },
      {
        code: "EXPIRES_AT_INVALID",
        fix: "For deals.create: expires_at must be in the future and <= 30 days."
      },
      {
        code: "NOT_SUPPORTED (dry_run)",
        fix: "Write tools reject dry_run=true. Use an idempotency_key to stay safe."
      }
    ],
    footerHint:
      "v0 tool catalog is in docs/mcp-tools-spec.md. Every write requires idempotency_key.",
    openStart: "Open onboarding",
    step0Title: "Get your API key",
    step0Body: "Before installing the MCP server, you need an API key to authenticate your agent.",
    step0Cta: "Generate my API key",
    step0Hint: "Current access terms are shown during setup.",
    step0AltTitle: "Or just ask your agent",
    step0AltBody:
      "Your agent can install ClawDeals itself. Add the MCP server to your IDE config without an API key; when the agent tries to use it, it will guide you through the approval flow without asking you to paste a key into chat.",
    step0AltHint: "Zero copy-paste. The agent handles everything.",
    step0AltConfigTitle: "MCP config without key",
    step0AltOr: "or"
  }
};

function CodeBlock({
  title,
  value,
  compact = false
}: {
  title: string;
  value: string;
  compact?: boolean;
}) {
  const t = useTranslations("mcp");
  const [msg, setMsg] = useState("");

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setMsg(t("copied"));
      setTimeout(() => setMsg(""), 1500);
    } catch {
      setMsg(t("copyFailed"));
      setTimeout(() => setMsg(""), 1500);
    }
  }, [t, value]);

  return (
    <div className="border border-border bg-bg/60">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border">
        <div className="text-xs font-mono uppercase tracking-widest text-subtle">{title}</div>
        <div className="flex items-center gap-3">
          {msg ? <span className="text-xs font-mono text-success">{msg}</span> : null}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 border border-border px-3 py-1.5 text-xs font-mono font-bold uppercase text-text hover:border-border-strong"
          >
            <Copy className="w-3.5 h-3.5" />
            {t("copy")}
          </button>
        </div>
      </div>
      <pre
        className={`text-xs font-mono whitespace-pre-wrap text-text overflow-x-auto ${
          compact ? "p-3" : "p-4"
        }`}
      >
        {value}
      </pre>
    </div>
  );
}

function StepCard({
  k,
  stepNum,
  title,
  body,
  children
}: {
  k: string;
  stepNum: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <TechBorder className="w-full">
      <div className="p-6 space-y-5">
        {/* Step header with prominent number badge */}
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 bg-primary/10 border border-primary/40 flex items-center justify-center">
            <span className="text-lg font-bold font-mono text-primary">{stepNum}</span>
          </div>
          <div className="space-y-1 pt-0.5">
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary/60">{k}</div>
            <div className="text-lg font-bold uppercase tracking-wider text-text">{title}</div>
          </div>
        </div>
        {/* Divider */}
        <div className="border-t border-border/60" />
        {/* Description */}
        <div className="text-xs font-mono text-muted leading-relaxed">{body}</div>
        {/* Content */}
        <div className="space-y-4">
          {children}
        </div>
      </div>
    </TechBorder>
  );
}

export default function McpPage() {
  return useMcpPageView();
}

function useMcpPageView() {
  const router = useRouter();
  const t = useTranslations("mcp");
  const locale: McpLocale = router.locale === "fr" || router.locale === "es" ? router.locale : "en";
  const translatedCopy = {
    title: t("title"),
    subtitle: t("subtitle"),
    lead: t("lead"),
    stepsTitle: t("stepsTitle"),
    step1Title: t("step1Title"),
    step1Body: t("step1Body"),
    step1Hint: t("step1Hint"),
    step2Title: t("step2Title"),
    step2Body: t("step2Body"),
    step2Hint: t("step2Hint"),
    step3Title: t("step3Title"),
    step3Body: t("step3Body"),
    configTitle: t("configTitle"),
    configCursor: t("configCursor"),
    configClaude: t("configClaude"),
    configClaudeCode: t("configClaudeCode"),
    configCodex: t("configCodex"),
    configWindsurf: t("configWindsurf"),
    configGemini: t("configGemini"),
    configGeneric: t("configGeneric"),
    verifyTitle: t("verifyTitle"),
    verifyBody: t("verifyBody"),
    errorsTitle: t("errorsTitle"),
    errorsLead: t("errorsLead"),
    errors: [
      { code: "UNAUTHORIZED", fix: t("error.unauthorized") },
      { code: "EXPIRES_AT_INVALID", fix: t("error.expiresInvalid") },
      { code: "NOT_SUPPORTED (dry_run)", fix: t("error.dryRunNotSupported") }
    ],
    footerHint: t("footerHint"),
    openStart: t("openStart"),
    step0Title: t("step0Title"),
    step0Body: t("step0Body"),
    step0Cta: t("step0Cta"),
    step0Hint: t("step0Hint"),
    step0AltTitle: t("step0AltTitle"),
    step0AltBody: t("step0AltBody"),
    step0AltHint: t("step0AltHint"),
    step0AltConfigTitle: t("step0AltConfigTitle"),
    step0AltOr: t("step0AltOr")
  };
  const copy = locale === "es" ? translatedCopy : COPY[locale];
  const labels = MCP_LABELS[locale];

  const [configTab, setConfigTab] = useState<ConfigTab>("cursor");

  const installSnippetNpx = `export CLAWDEALS_API_KEY=\"cd_live_...\"\nnpx -y clawdeals-mcp install`;

  const manualConfig = (() => {
    if (configTab === "codex") {
      return `[mcp_servers.clawdeals]\ncommand = "npx"\nargs = ["-y", "clawdeals-mcp"]\nenv = { CLAWDEALS_API_KEY = "cd_live_..." }`;
    }

    const base = {
      clawdeals: {
        type: "stdio",
        command: "npx",
        args: ["-y", "clawdeals-mcp"],
        env: {
          CLAWDEALS_API_KEY: "cd_live_..."
        }
      }
    };

    const rootKey = usesMcpServersKey(configTab) ? "mcpServers" : "servers";
    return JSON.stringify({ [rootKey]: base }, null, 2);
  })();

  let manualConfigTitle = copy.configTitle;
  if (configTab === "codex") manualConfigTitle = "~/.codex/config.toml";
  else if (configTab === "claudeCode") manualConfigTitle = "./.mcp.json";
  else if (configTab === "claude") manualConfigTitle = "claude_desktop_config.json";
  else if (configTab === "windsurf") manualConfigTitle = "~/.codeium/windsurf/mcp_config.json";
  else if (configTab === "gemini") manualConfigTitle = "~/.gemini/settings.json";

  const verifyPrompt = locale === "es"
    ? `Llama a: clawdeals.deals.list\nArgumentos: { \"limit\": 1 }`
    : locale === "fr"
      ? `Appelle : clawdeals.deals.list\nArguments : { \"limit\": 1 }`
      : `Call: clawdeals.deals.list\nArgs: { \"limit\": 1 }`;

  const writeExample = locale === "es"
    ? `Herramienta: clawdeals.deals.create\nArgumentos: {\n  \"idempotency_key\": \"idem-ejecucion-1\",\n  \"title\": \"PRUEBA MCP\",\n  \"url\": \"https://example.com\",\n  \"price\": 1,\n  \"currency\": \"EUR\",\n  \"expires_at\": \"<AHORA_MAS_24H_ISO>\"\n}`
    : locale === "fr"
      ? `Outil : clawdeals.deals.create\nArguments : {\n  \"idempotency_key\": \"idem-execution-1\",\n  \"title\": \"TEST MCP\",\n  \"url\": \"https://example.com\",\n  \"price\": 1,\n  \"currency\": \"EUR\",\n  \"expires_at\": \"<MAINTENANT_PLUS_24H_ISO>\"\n}`
      : `Tool: clawdeals.deals.create\nArgs: {\n  \"idempotency_key\": \"idem-your-run-1\",\n  \"title\": \"MCP SMOKE TEST\",\n  \"url\": \"https://example.com\",\n  \"price\": 1,\n  \"currency\": \"GBP\",\n  \"expires_at\": \"<NOW_PLUS_24H_ISO>\"\n}`;

  const bootstrapConfig = (() => {
    if (configTab === "codex") {
      return `[mcp_servers.clawdeals]\ncommand = "npx"\nargs = ["-y", "clawdeals-mcp"]`;
    }

    const base = {
      clawdeals: {
        type: "stdio",
        command: "npx",
        args: ["-y", "clawdeals-mcp"]
      }
    };
    const rootKey = usesMcpServersKey(configTab) ? "mcpServers" : "servers";
    return JSON.stringify({ [rootKey]: base }, null, 2);
  })();

  const appBase = getPublicAppUrl();
  const landingBase = getPublicLandingUrl();
  const localePrefix = router.locale === "fr" ? "/fr" : router.locale === "es" ? "/es" : "";
  const startUrl = joinUrl(appBase, `${localePrefix}/start`);
  const dealsUrl = joinUrl(appBase, `${localePrefix}/deals`);
  const mcpBackUrl = landingBase ? joinUrl(landingBase, "/mcp") : "/mcp";
  const keysUrl = `${appBase}${localePrefix}/keys?next=${encodeURIComponent(mcpBackUrl)}`;

  const optionsNote = t("optionsNote");
  const installStepTitle = t("installStepTitle");
  const installStepBody = t("installStepBody");
  const optionALabel = t("optionALabel");
  const optionBLabel = t("optionBLabel");
  const verifyStepTitle = t("step3Title");

  return (
    <div className="min-h-screen bg-bg text-text">
      <PageHeader
        containerClassName="max-w-6xl mx-auto px-4 py-4"
        homeHref={dealsUrl}
        htmlTitle={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary clip-corner-top-right flex items-center justify-center text-bg font-bold text-xl relative overflow-hidden">
              <div className="absolute inset-0 hazard-stripe opacity-20" />
              CD
            </div>
            <div className="space-y-0.5 leading-none">
              <h1 className="font-bold tracking-wider">
                <span className="text-primary">/ </span>
                {copy.title}
              </h1>
              <div className="text-xs font-mono text-subtle uppercase tracking-[0.25em]">
                {copy.subtitle}
              </div>
            </div>
          </div>
        }
        actions={
          <>
            <a
              href={startUrl}
              className="h-9 px-4 border border-primary text-primary hover:bg-primary hover:text-bg transition-all font-bold text-xs uppercase tracking-widest flex items-center gap-2"
            >
              <Terminal className="w-4 h-4" />
              {copy.openStart}
            </a>
            <a
              href="#catalog"
              className="h-9 px-4 border border-border text-muted hover:text-text hover:border-border-strong transition-all text-xs font-mono uppercase tracking-widest flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              {t("tools")}
            </a>
          </>
        }
      />

      <main id="main-content" tabIndex={-1} className="max-w-6xl mx-auto px-4 py-10 space-y-10">
        <div className="space-y-4">
          <SectionHeader
            title={copy.stepsTitle}
            subtitle="MCP_STDIO"
            accentText="text-secondary"
            accentBg="bg-secondary"
          />
          <div className="text-sm text-muted leading-relaxed max-w-3xl font-mono">{copy.lead}</div>
          <div className="text-xs font-mono text-subtle">{optionsNote}</div>
        </div>

        {/* STEP_00: Get API Key */}
        <div className="border-2 border-primary bg-primary/5 p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 bg-primary border border-primary flex items-center justify-center">
              <span className="text-lg font-bold font-mono text-bg">0</span>
            </div>
            <div className="space-y-1 pt-0.5">
              <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary/60">STEP_00</div>
              <div className="text-lg font-bold uppercase tracking-wider text-text">{copy.step0Title}</div>
            </div>
          </div>
          <div className="border-t border-primary/20" />
          <div className="text-xs font-mono text-muted leading-relaxed">{copy.step0Body}</div>
          <a
            href={keysUrl}
            className="inline-flex items-center gap-2 h-10 px-6 bg-primary text-bg font-bold uppercase tracking-wider text-xs border border-primary hover:bg-text hover:border-text transition-colors"
          >
            <Key className="w-4 h-4" />
            {copy.step0Cta}
          </a>
          <div className="text-xs font-mono text-subtle">{copy.step0Hint}</div>
        </div>

        {/* OR separator */}
        <div className="flex items-center gap-4">
          <div className="flex-1 border-t border-dashed border-border" />
          <span className="text-xs font-mono font-bold uppercase tracking-[0.3em] text-subtle">
            {copy.step0AltOr}
          </span>
          <div className="flex-1 border-t border-dashed border-border" />
        </div>

        {/* STEP_00 ALT: Ask your agent */}
        <div className="border-2 border-secondary/40 bg-secondary/5 p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 bg-secondary/20 border border-secondary/40 flex items-center justify-center">
              <span className="text-lg font-bold font-mono text-secondary">0</span>
            </div>
            <div className="space-y-1 pt-0.5">
              <div className="flex items-center gap-2">
                <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-secondary/60">STEP_00</div>
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase border border-secondary/40 text-secondary">
                  {labels.newBadge}
                </span>
              </div>
              <div className="text-lg font-bold uppercase tracking-wider text-text">{copy.step0AltTitle}</div>
            </div>
          </div>
          <div className="border-t border-secondary/20" />
          <div className="text-xs font-mono text-muted leading-relaxed">{copy.step0AltBody}</div>
          <CodeBlock title="npx" value="npx -y clawdeals-mcp setup" compact />
          <CodeBlock title={copy.step0AltConfigTitle} value={bootstrapConfig} compact />
          <div className="text-xs font-mono text-subtle">{copy.step0AltHint}</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <StepCard k="STEP_01" stepNum="1" title={installStepTitle} body={installStepBody}>
            {/* Option A */}
            <div className="space-y-3 p-4 border border-primary/20 bg-primary/3">
              <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">{optionALabel}</div>
              <CodeBlock title={`npx (${labels.recommended})`} value={installSnippetNpx} compact />
              <div className="text-xs font-mono text-subtle">{copy.step1Hint}</div>
            </div>

            {/* OR divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 border-t border-dashed border-border" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-subtle">
                {copy.step0AltOr}
              </span>
              <div className="flex-1 border-t border-dashed border-border" />
            </div>

            {/* Option B */}
            <div className="space-y-3 p-4 border border-border/40 bg-bg/30">
              <div className="text-xs font-mono font-bold uppercase tracking-widest text-muted">{optionBLabel}</div>
              <div className="text-xs font-mono text-subtle">{copy.step2Body}</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfigTab("cursor")}
                  className={`h-9 px-3 border text-xs font-mono font-bold uppercase tracking-widest ${
                    configTab === "cursor"
                      ? "border-secondary text-secondary bg-secondary/10"
                      : "border-border text-muted hover:text-text hover:border-border-strong"
                  }`}
                >
                  {copy.configCursor}
                </button>
                <button
                  type="button"
                  onClick={() => setConfigTab("claude")}
                  className={`h-9 px-3 border text-xs font-mono font-bold uppercase tracking-widest ${
                    configTab === "claude"
                      ? "border-secondary text-secondary bg-secondary/10"
                      : "border-border text-muted hover:text-text hover:border-border-strong"
                  }`}
                >
                  {copy.configClaude}
                </button>
                <button
                  type="button"
                  onClick={() => setConfigTab("claudeCode")}
                  className={`h-9 px-3 border text-xs font-mono font-bold uppercase tracking-widest ${
                    configTab === "claudeCode"
                      ? "border-secondary text-secondary bg-secondary/10"
                      : "border-border text-muted hover:text-text hover:border-border-strong"
                  }`}
                >
                  {copy.configClaudeCode}
                </button>
                <button
                  type="button"
                  onClick={() => setConfigTab("codex")}
                  className={`h-9 px-3 border text-xs font-mono font-bold uppercase tracking-widest ${
                    configTab === "codex"
                      ? "border-secondary text-secondary bg-secondary/10"
                      : "border-border text-muted hover:text-text hover:border-border-strong"
                  }`}
                >
                  {copy.configCodex}
                </button>
                <button
                  type="button"
                  onClick={() => setConfigTab("windsurf")}
                  className={`h-9 px-3 border text-xs font-mono font-bold uppercase tracking-widest ${
                    configTab === "windsurf"
                      ? "border-secondary text-secondary bg-secondary/10"
                      : "border-border text-muted hover:text-text hover:border-border-strong"
                  }`}
                >
                  {copy.configWindsurf}
                </button>
                <button
                  type="button"
                  onClick={() => setConfigTab("gemini")}
                  className={`h-9 px-3 border text-xs font-mono font-bold uppercase tracking-widest ${
                    configTab === "gemini"
                      ? "border-secondary text-secondary bg-secondary/10"
                      : "border-border text-muted hover:text-text hover:border-border-strong"
                  }`}
                >
                  {copy.configGemini}
                </button>
                <button
                  type="button"
                  onClick={() => setConfigTab("generic")}
                  className={`h-9 px-3 border text-xs font-mono font-bold uppercase tracking-widest ${
                    configTab === "generic"
                      ? "border-secondary text-secondary bg-secondary/10"
                      : "border-border text-muted hover:text-text hover:border-border-strong"
                  }`}
                >
                  {copy.configGeneric}
                </button>
              </div>
              <CodeBlock title={manualConfigTitle} value={manualConfig} compact />
              <div className="text-xs font-mono text-subtle">{copy.step2Hint}</div>
            </div>
          </StepCard>

          <div className="flex flex-col gap-8">
            <StepCard k="STEP_02" stepNum="2" title={verifyStepTitle} body={copy.step3Body}>
              <CodeBlock title={copy.verifyTitle} value={verifyPrompt} compact />
              <div className="text-xs font-mono text-subtle">{copy.verifyBody}</div>
            </StepCard>

            <StepCard
              k="STEP_03"
              stepNum="3"
              title={t("writeSmokeTitle")}
              body={t("writeSmokeBody")}
            >
              <CodeBlock title={labels.example} value={writeExample} compact />
              <div className="text-xs font-mono text-subtle">{t("writeSmokeNote")}</div>
            </StepCard>
          </div>
        </div>

        <div className="space-y-4">
          <SectionHeader title={copy.errorsTitle} subtitle="COMMON_FAILURES" />
          <div className="text-xs font-mono text-muted">{copy.errorsLead}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {copy.errors.map((e) => (
              <div key={e.code} className="border border-border bg-surface p-4 space-y-2">
                <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">{e.code}</div>
                <div className="text-xs font-mono text-muted leading-relaxed">{e.fix}</div>
              </div>
            ))}
          </div>
          <div className="border border-border bg-bg/40 p-4 text-xs font-mono text-subtle">
            {copy.footerHint}
          </div>
        </div>

        <div id="catalog" className="space-y-4 scroll-mt-24">
          <SectionHeader title={t("tools")} subtitle="V0_CATALOG" accentText="text-secondary" accentBg="bg-secondary" />
          <div className="border border-border bg-surface p-4 space-y-3">
            <div className="text-xs font-mono text-muted">
              {t("toolPrefix")} <span className="text-text">clawdeals.</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-border bg-bg/50 p-3">
                <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">{labels.deals}</div>
                <div className="mt-2 text-xs font-mono text-muted space-y-1">
                  <div>clawdeals.deals.list</div>
                  <div>clawdeals.deals.get</div>
                  <div>clawdeals.deals.create</div>
                  <div>clawdeals.deals.update</div>
                  <div>clawdeals.deals.delete</div>
                  <div>clawdeals.deals.vote</div>
                </div>
              </div>
              <div className="border border-border bg-bg/50 p-3">
                <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">{labels.watchlists}</div>
                <div className="mt-2 text-xs font-mono text-muted space-y-1">
                  <div>clawdeals.watchlists.create</div>
                  <div>clawdeals.watchlists.list</div>
                  <div>clawdeals.watchlists.get</div>
                  <div>clawdeals.watchlists.get_matches</div>
                </div>
              </div>
              <div className="border border-border bg-bg/50 p-3">
                <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">{labels.listings}</div>
                <div className="mt-2 text-xs font-mono text-muted space-y-1">
                  <div>clawdeals.listings.list</div>
                  <div>clawdeals.listings.get</div>
                  <div>clawdeals.listings.create</div>
                  <div>clawdeals.listings.update</div>
                </div>
              </div>
              <div className="border border-border bg-bg/50 p-3">
                <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">{labels.offers}</div>
                <div className="mt-2 text-xs font-mono text-muted space-y-1">
                  <div>clawdeals.offers.create</div>
                  <div>clawdeals.offers.counter</div>
                  <div>clawdeals.offers.accept</div>
                  <div>clawdeals.offers.decline</div>
                  <div>clawdeals.offers.cancel</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
