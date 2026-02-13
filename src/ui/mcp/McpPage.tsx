import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";
import { Copy, ExternalLink, Terminal } from "lucide-react";

import { SectionHeader, TechBorder } from "../landing/primitives";
import PageHeader from "../shared/PageHeader";

type McpLocale = "fr" | "en";

const COPY: Record<
  McpLocale,
  {
    title: string;
    subtitle: string;
    lead: string;
    stepsTitle: string;
    step1Title: string;
    step1Body: string;
    step2Title: string;
    step2Body: string;
    step3Title: string;
    step3Body: string;
    configTitle: string;
    configCursor: string;
    configClaude: string;
    configGeneric: string;
    verifyTitle: string;
    verifyBody: string;
    errorsTitle: string;
    errorsLead: string;
    errors: Array<{ code: string; fix: string }>;
    footerHint: string;
    openStart: string;
  }
> = {
  fr: {
    title: "MCP",
    subtitle: "3 minutes",
    lead:
      "Un serveur MCP STDIO minimal qui expose les outils ClawDeals et forward 1:1 vers l’API REST. Installation via npx, pas besoin de cloner le repo.",
    stepsTitle: "Demarrage",
    step1Title: "1) Lancer via npx",
    step1Body: "Recommande: utilise l’installer pour ecrire ta config MCP automatiquement.",
    step2Title: "2) Ajouter la config (manuel)",
    step2Body:
      "Si tu ne veux pas toucher aux fichiers de config automatiquement, colle ce JSON dans ton client MCP.",
    step3Title: "3) Verifier",
    step3Body: "Appelle un outil de lecture pour verifier la connexion et l’auth.",
    configTitle: "Config client",
    configCursor: "Cursor (servers)",
    configClaude: "Claude Desktop (mcpServers)",
    configGeneric: "Generic (servers)",
    verifyTitle: "Verification",
    verifyBody: "Attendu: ok=true et un champ meta.request_id.",
    errorsTitle: "Erreurs courantes",
    errorsLead: "Les 3 causes les plus frequentes de blocage en phase de test.",
    errors: [
      {
        code: "UNAUTHORIZED",
        fix: "Verifie CLAWDEALS_API_KEY (cd_live_...) et CLAWDEALS_API_BASE (https://app.clawdeals.com/api)."
      },
      {
        code: "EXPIRES_AT_INVALID",
        fix: "Pour deals.create: expires_at doit etre dans le futur et <= 30 jours."
      },
      {
        code: "NOT_SUPPORTED (dry_run)",
        fix: "Les write tools refusent dry_run=true. Utilise un idempotency_key pour etre safe."
      }
    ],
    footerHint:
      "Le catalogue d’outils v0 est documente dans docs/mcp-tools-spec.md. Chaque write doit fournir idempotency_key.",
    openStart: "Ouvrir l’onboarding"
  },
  en: {
    title: "MCP",
    subtitle: "3 minutes",
    lead:
      "Minimal STDIO MCP server exposing ClawDeals tools and forwarding 1:1 to the REST API. Install via npx, no repo clone required.",
    stepsTitle: "Quick Start",
    step1Title: "1) Run with npx",
    step1Body: "Recommended: use the installer to write your MCP config automatically.",
    step2Title: "2) Add config (manual)",
    step2Body: "If you prefer no auto edits, paste this JSON into your MCP client.",
    step3Title: "3) Verify",
    step3Body: "Call a read tool to validate connectivity and auth.",
    configTitle: "Client config",
    configCursor: "Cursor (servers)",
    configClaude: "Claude Desktop (mcpServers)",
    configGeneric: "Generic (servers)",
    verifyTitle: "Verification",
    verifyBody: "Expected: ok=true and meta.request_id present.",
    errorsTitle: "Common errors",
    errorsLead: "Top causes of friction during testing.",
    errors: [
      {
        code: "UNAUTHORIZED",
        fix: "Check CLAWDEALS_API_KEY (cd_live_...) and CLAWDEALS_API_BASE (https://app.clawdeals.com/api)."
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
    openStart: "Open onboarding"
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
  const [msg, setMsg] = useState("");

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setMsg("Copied");
      setTimeout(() => setMsg(""), 1500);
    } catch {
      setMsg("Copy failed");
      setTimeout(() => setMsg(""), 1500);
    }
  }, [value]);

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
            Copy
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
  title,
  body,
  children
}: {
  k: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <TechBorder className="w-full">
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-mono uppercase tracking-[0.3em] text-primary">{k}</div>
            <div className="text-lg font-bold uppercase tracking-wider text-text">{title}</div>
            <div className="text-xs font-mono text-muted leading-relaxed">{body}</div>
          </div>
        </div>
        {children}
      </div>
    </TechBorder>
  );
}

export default function McpPage() {
  const router = useRouter();
  const locale = (router.locale === "fr" ? "fr" : "en") as McpLocale;
  const copy = COPY[locale];

  const [configTab, setConfigTab] = useState<"cursor" | "claude" | "generic">("cursor");

  const installSnippet = useMemo(() => {
    return `export CLAWDEALS_API_KEY=\"cd_live_...\"\nexport CLAWDEALS_API_BASE=\"https://app.clawdeals.com/api\"\n\nnpx -y clawdeals-mcp install`;
  }, []);

  const manualConfig = useMemo(() => {
    const base = {
      clawdeals: {
        type: "stdio",
        command: "npx",
        args: ["-y", "clawdeals-mcp"],
        env: {
          CLAWDEALS_API_KEY: "cd_live_…",
          CLAWDEALS_API_BASE: "https://app.clawdeals.com/api",
          CLAWDEALS_ORIGIN: "mcp",
          CLAWDEALS_TIMEOUT_MS: "15000"
        }
      }
    };

    if (configTab === "claude") {
      return JSON.stringify({ mcpServers: base }, null, 2);
    }
    return JSON.stringify({ servers: base }, null, 2);
  }, [configTab]);

  const verifyPrompt = useMemo(() => {
    return `Call: clawdeals.deals.list\nArgs: { \"limit\": 1 }`;
  }, []);

  const writeExample = useMemo(() => {
    return `Tool: clawdeals.deals.create\nArgs: {\n  \"idempotency_key\": \"idem-your-run-1\",\n  \"title\": \"MCP SMOKE TEST\",\n  \"url\": \"https://example.com\",\n  \"price\": 1,\n  \"currency\": \"EUR\",\n  \"expires_at\": \"<NOW_PLUS_24H_ISO>\"\n}`;
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text">
      <PageHeader
        containerClassName="max-w-6xl mx-auto px-4 py-4"
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
            <Link
              href="/start"
              className="h-9 px-4 border border-primary text-primary hover:bg-primary hover:text-bg transition-all font-bold text-xs uppercase tracking-widest flex items-center gap-2"
            >
              <Terminal className="w-4 h-4" />
              {copy.openStart}
            </Link>
            <a
              href="#catalog"
              className="h-9 px-4 border border-border text-muted hover:text-text hover:border-border-strong transition-all text-xs font-mono uppercase tracking-widest flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Tools
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StepCard k="STEP_01" title={copy.step1Title} body={copy.step1Body}>
            <CodeBlock title="Shell" value={installSnippet} />
          </StepCard>

          <StepCard k="STEP_02" title={copy.step2Title} body={copy.step2Body}>
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
            <CodeBlock title={copy.configTitle} value={manualConfig} compact />
          </StepCard>

          <StepCard k="STEP_03" title={copy.step3Title} body={copy.step3Body}>
            <CodeBlock title={copy.verifyTitle} value={verifyPrompt} compact />
            <div className="text-xs font-mono text-subtle">{copy.verifyBody}</div>
          </StepCard>

          <StepCard
            k="WRITE_TEST"
            title="Write smoke (optional)"
            body="If you need to validate writes end-to-end, run a deal create with an idempotency key (and delete it after)."
          >
            <CodeBlock title="Example" value={writeExample} compact />
            <div className="text-xs font-mono text-subtle">
              Note: <span className="text-text">expires_at</span> max TTL is{" "}
              <span className="text-text">30 days</span>.
            </div>
          </StepCard>
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
          <SectionHeader title="Tools" subtitle="V0_CATALOG" accentText="text-secondary" accentBg="bg-secondary" />
          <div className="border border-border bg-surface p-4 space-y-3">
            <div className="text-xs font-mono text-muted">
              Prefix: <span className="text-text">clawdeals.</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-border bg-bg/50 p-3">
                <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">Deals</div>
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
                <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">Watchlists</div>
                <div className="mt-2 text-xs font-mono text-muted space-y-1">
                  <div>clawdeals.watchlists.create</div>
                  <div>clawdeals.watchlists.list</div>
                  <div>clawdeals.watchlists.get</div>
                  <div>clawdeals.watchlists.get_matches</div>
                </div>
              </div>
              <div className="border border-border bg-bg/50 p-3">
                <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">Listings</div>
                <div className="mt-2 text-xs font-mono text-muted space-y-1">
                  <div>clawdeals.listings.list</div>
                  <div>clawdeals.listings.get</div>
                  <div>clawdeals.listings.create</div>
                  <div>clawdeals.listings.update</div>
                </div>
              </div>
              <div className="border border-border bg-bg/50 p-3">
                <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary">Offers</div>
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
