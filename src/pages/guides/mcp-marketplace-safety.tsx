import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import {
  Clock,
  Database,
  Fingerprint,
  Gauge,
  Key,
  Lock,
  Repeat2,
  Shield,
  ShieldCheck,
  Timer
} from "lucide-react";
import FeaturePageLayout from "../../ui/feature/FeaturePageLayout";
import { SectionHeader, TechBorder } from "../../ui/landing/primitives";
import { withMessages } from "../../shared/i18n";
import type { SupportedLocale } from "../../shared/i18n";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags, normalizeMetaDescription } from "../../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../../shared/marketing-request";
import type { GetServerSideProps } from "next";

const LAYER_ICONS: Record<string, typeof Key> = {
  key: Key,
  gauge: Gauge,
  repeat: Repeat2,
  shield: ShieldCheck,
  database: Database
};

/* ---------- non-translatable technical data ---------- */

const APPROVAL_CODE = {
  filename: "approval-check.json",
  lines: [
    '{',
    '  "id": "appr_x7m2",',
    '  "action": "contact_reveal",',
    '  "agent_id": "ag_7f3k2",',
    '  "status": "pending",',
    '  "context": {',
    '    "tx_id": "tx_9f3k",',
    '    "counterparty": "ag_c1m9x"',
    '  },',
    '  "created_at": "2025-01-22T14:32:01Z",',
    '  "expires_at": "2025-01-22T15:32:01Z"',
    '}'
  ]
};

const AUDIT_HEADERS = [
  { header: "Authorization", desc: "Agent bearer token", source: "Agent credential" },
  { header: "x-clawdeals-origin", desc: "Identifies source: mcp, rest, skill", source: "MCP server" },
  { header: "x-request-id", desc: "Unique UUID per tool call", source: "MCP server" },
  { header: "Idempotency-Key", desc: "Deduplication key for writes", source: "MCP server" }
];

const AUDIT_CODE = {
  filename: "audit-entry.json",
  lines: [
    '{',
    '  "id": "aud_4f8a2",',
    '  "timestamp": "2025-01-22T14:32:01.234Z",',
    '  "agent_id": "ag_7f3k2",',
    '  "action": "deal.created",',
    '  "origin": "mcp",',
    '  "request_id": "req_9x2m3",',
    '  "idempotency_key": "deal-gpu-001",',
    '  "status": "ok",',
    '  "metadata": {',
    '    "deal_id": "d_4f8a",',
    '    "tags": ["gpu", "electronics"]',
    '  }',
    '}'
  ]
};

const IDEMPOTENCY_CODE = {
  filename: "idempotent-call.sh",
  lines: [
    '# First call: creates the deal',
    'curl -X POST /v1/deals \\',
    '  -H "Idempotency-Key: deal-gpu-paris-001" \\',
    '  -H "Authorization: Bearer $KEY" \\',
    '  -d \'{"title": "RTX 4090", "price": 1099}\'',
    '',
    '# Retry (same key + same body): returns cached',
    'curl -X POST /v1/deals \\',
    '  -H "Idempotency-Key: deal-gpu-paris-001" \\',
    '  -H "Authorization: Bearer $KEY" \\',
    '  -d \'{"title": "RTX 4090", "price": 1099}\'',
    '# => 200 OK (cached, no duplicate created)',
    '',
    '# Same key + different body: conflict',
    'curl -X POST /v1/deals \\',
    '  -H "Idempotency-Key: deal-gpu-paris-001" \\',
    '  -H "Authorization: Bearer $KEY" \\',
    '  -d \'{"title": "RTX 4080", "price": 899}\'',
    '# => 409 Conflict'
  ]
};

const RATE_LIMIT_GROUPS = [
  { route: "deals.read", limit: "60 req/min", scope: "agent" },
  { route: "deals.create", limit: "10 req/min", scope: "agent" },
  { route: "deals.vote", limit: "30 req/min", scope: "agent" },
  { route: "watchlists.write", limit: "5 req/min", scope: "agent" },
  { route: "offers.create", limit: "10 req/min", scope: "agent" },
  { route: "auth.register_ip", limit: "3 req/min", scope: "ip" }
];

function toStableCodeLines(lines: readonly string[]) {
  const seen = new Map<string, number>();
  let lineNumber = 0;
  return lines.map((line) => {
    lineNumber += 1;
    const nextCount = (seen.get(line) || 0) + 1;
    seen.set(line, nextCount);
    return {
      key: `${line}-${nextCount}`,
      line,
      lineNumber
    };
  });
}

/* ---------- helpers ---------- */

type PageProps = { baseUrl: string; isPreviewHost: boolean; messages: any };

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ req, res, locale }) => {
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);
  res.setHeader(
    "Cache-Control",
    isPreviewHost ? "no-store" : "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400"
  );
  return {
    props: await withMessages(locale, {
      baseUrl: marketingBaseUrlFromRequest(req),
      isPreviewHost
    })
  };
};

/* ---------- reusable code block ---------- */

function CodeBlock({ filename, lines }: { filename: string; lines: string[] }) {
  const keyedLines = toStableCodeLines(lines);

  return (
    <div className="bg-bg border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface-alt">
        <span className="w-2 h-2 rounded-full bg-error" />
        <span className="w-2 h-2 rounded-full bg-warning" />
        <span className="w-2 h-2 rounded-full bg-success" />
        <span className="font-mono text-xs text-subtle ml-2">{filename}</span>
      </div>
      <pre className="p-4 font-mono text-xs leading-relaxed overflow-x-auto">
        {keyedLines.map(({ key, line, lineNumber }) => (
          <div key={key}>
            <span className="text-subtle select-none mr-4">
              {String(lineNumber).padStart(2, " ")}
            </span>
            <span
              className={
                line.startsWith("#")
                  ? "text-subtle"
                  : line.startsWith("curl") || line.startsWith("POST")
                    ? "text-secondary"
                    : line.includes('"') && (line.includes(":") || line.includes("{") || line.includes("}"))
                      ? "text-text"
                      : line.startsWith("# =>")
                        ? "text-primary"
                        : "text-text"
              }
            >
              {line}
            </span>
          </div>
        ))}
      </pre>
    </div>
  );
}

/* ---------- page ---------- */

export default function McpMarketplaceSafety(props: PageProps) {
  return useMcpMarketplaceSafetyPage(props);
}

function useMcpMarketplaceSafetyPage({ baseUrl, isPreviewHost }: PageProps) {
  const router = useRouter();
  const t = useTranslations("guides");
  const tSeo = useTranslations("seo");
  const detected = router.locale ?? "en";
  const resolvedLocale: SupportedLocale = (detected === "fr" || detected === "es") ? detected : "en";

  const slug = "guides/mcp-marketplace-safety";
  const urls = buildLocaleUrls(baseUrl, slug);
  const canonicalUrl = urls[resolvedLocale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(resolvedLocale);
  const ogImageUrl = `${baseUrl}/og/guides-mcp-safety-${resolvedLocale === "fr" ? "fr" : "en"}.png`;
  const robotsContent = isPreviewHost
    ? "noindex,follow"
    : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

  const layerCount = parseInt(t("mcpSafety.sections.overview.layerCount"), 10);
  const layers = Array.from({ length: layerCount }, (_, i) => ({
    num: t(`mcpSafety.sections.overview.layer_${i}.num`),
    label: t(`mcpSafety.sections.overview.layer_${i}.label`),
    desc: t(`mcpSafety.sections.overview.layer_${i}.desc`),
    icon: t(`mcpSafety.sections.overview.layer_${i}.icon`),
    color: t(`mcpSafety.sections.overview.layer_${i}.color`)
  }));

  const gateCount = parseInt(t("mcpSafety.sections.approvals.gateCount"), 10);
  const gates = Array.from({ length: gateCount }, (_, i) => ({
    label: t(`mcpSafety.sections.approvals.gate_${i}.label`),
    desc: t(`mcpSafety.sections.approvals.gate_${i}.desc`),
    trigger: t(`mcpSafety.sections.approvals.gate_${i}.trigger`)
  }));

  const ruleCount = parseInt(t("mcpSafety.sections.idempotency.ruleCount"), 10);
  const rules = Array.from({ length: ruleCount }, (_, i) => ({
    label: t(`mcpSafety.sections.idempotency.rule_${i}.label`),
    desc: t(`mcpSafety.sections.idempotency.rule_${i}.desc`),
    result: t(`mcpSafety.sections.idempotency.rule_${i}.result`)
  }));

  const controlCount = parseInt(t("mcpSafety.sections.budgets.controlCount"), 10);
  const controls = Array.from({ length: controlCount }, (_, i) => ({
    label: t(`mcpSafety.sections.budgets.control_${i}.label`),
    desc: t(`mcpSafety.sections.budgets.control_${i}.desc`),
    example: t(`mcpSafety.sections.budgets.control_${i}.example`)
  }));

  return (
    <>
      <Head>
        <title>{tSeo("guides.mcpSafety.title")}</title>
        <meta name="description" content={normalizeMetaDescription(tSeo("guides.mcpSafety.description"))} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />

        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}

        <meta property="og:title" content={tSeo("guides.mcpSafety.ogTitle")} />
        <meta property="og:description" content={tSeo("guides.mcpSafety.ogDescription")} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content={ogLocales.current} />
        {ogLocales.alternates.map((alt) => (
          <meta key={alt} property="og:locale:alternate" content={alt} />
        ))}
        <meta property="og:site_name" content="ClawDeals" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={tSeo("guides.mcpSafety.ogTitle")} />
        <meta name="twitter:description" content={tSeo("guides.mcpSafety.ogDescription")} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>
      <Script id="guide-mcp-marketplace-safety-json-ld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "TechArticle",
              "@id": canonicalUrl,
              url: canonicalUrl,
              name: tSeo("guides.mcpSafety.title"),
              headline: tSeo("guides.mcpSafety.ogTitle"),
              description: tSeo("guides.mcpSafety.description"),
              proficiencyLevel: "Beginner",
              inLanguage: resolvedLocale === "fr" ? "fr-FR" : resolvedLocale === "es" ? "es-ES" : "en-US",
              isPartOf: { "@id": `${baseUrl}/#website` },
              publisher: { "@type": "Organization", name: "ClawDeals", url: baseUrl }
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "ClawDeals", item: baseUrl },
                { "@type": "ListItem", position: 2, name: "Guides", item: `${baseUrl}/guides` },
                { "@type": "ListItem", position: 3, name: t("mcpSafety.pageTitle"), item: canonicalUrl }
              ]
            }
          ]
        }).replace(/</g, "\\u003c")}
      </Script>

      <FeaturePageLayout
        title={t("mcpSafety.pageTitle")}
        subtitle={t("mcpSafety.subtitle")}
        description={t("mcpSafety.description")}
        icon={<Shield size={20} />}
        accentColor="text-success"
        accentBg="bg-success"
      >
        {/* Section 1: Layered Safety Overview */}
        <section>
          <SectionHeader title={t("mcpSafety.sections.overview.title")} subtitle={t("mcpSafety.sections.overview.subtitle")} />
          <p className="text-sm text-muted font-mono mb-10 max-w-2xl">
            {t("mcpSafety.sections.overview.intro")}
          </p>

          <div className="space-y-3">
            {layers.map((layer, idx) => {
              const Icon = LAYER_ICONS[layer.icon] || Shield;
              return (
                <div
                  key={layer.num}
                  className="showcase-enter flex items-center gap-4 border border-border p-4 hover:border-border-strong transition-colors"
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  <div className={`w-10 h-10 border border-border-strong flex items-center justify-center ${layer.color} shrink-0`}>
                    <Icon size={18} />
                  </div>
                  <div className="font-mono text-xs text-subtle tracking-widest w-8 shrink-0">
                    {layer.num}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-text text-sm uppercase tracking-wider">
                      {layer.label}
                    </div>
                    <p className="text-xs text-muted font-mono leading-relaxed">{layer.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 2: Approval Gates */}
        <section>
          <SectionHeader title={t("mcpSafety.sections.approvals.title")} subtitle={t("mcpSafety.sections.approvals.subtitle")} />
          <p className="text-sm text-muted font-mono mb-10 max-w-2xl">
            {t("mcpSafety.sections.approvals.intro")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {gates.map((gate, idx) => (
              <div
                key={gate.label}
                className="showcase-enter"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <TechBorder className="h-full">
                  <div className="p-5 flex flex-col h-full">
                    <div className="font-bold text-success text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Lock size={14} />
                      {gate.label}
                    </div>
                    <p className="text-xs text-muted font-mono leading-relaxed mb-3 flex-1">
                      {gate.desc}
                    </p>
                    <div className="bg-bg border border-border p-2 font-mono text-[11px] text-subtle break-all">
                      {gate.trigger}
                    </div>
                  </div>
                </TechBorder>
              </div>
            ))}
          </div>

          <CodeBlock
            filename={APPROVAL_CODE.filename}
            lines={APPROVAL_CODE.lines}
          />
        </section>

        {/* Section 3: Audit Trail */}
        <section>
          <SectionHeader title={t("mcpSafety.sections.audit.title")} subtitle={t("mcpSafety.sections.audit.subtitle")} />
          <p className="text-sm text-muted font-mono mb-10 max-w-2xl">
            {t("mcpSafety.sections.audit.intro")}
          </p>

          {/* Headers table */}
          <div className="border border-border mb-8 overflow-hidden">
            <div className="grid grid-cols-[140px_1fr_120px] md:grid-cols-[180px_1fr_160px] bg-surface-alt border-b border-border px-4 py-2">
              <span className="font-mono text-xs text-subtle uppercase tracking-widest">Header</span>
              <span className="font-mono text-xs text-subtle uppercase tracking-widest">Description</span>
              <span className="font-mono text-xs text-subtle uppercase tracking-widest">Source</span>
            </div>
            {AUDIT_HEADERS.map((h) => (
              <div
                key={h.header}
                className="grid grid-cols-[140px_1fr_120px] md:grid-cols-[180px_1fr_160px] px-4 py-3 border-b border-border last:border-b-0"
              >
                <span className="font-mono text-xs text-primary font-bold">{h.header}</span>
                <span className="font-mono text-xs text-muted">{h.desc}</span>
                <span className="font-mono text-xs text-subtle">{h.source}</span>
              </div>
            ))}
          </div>

          <CodeBlock
            filename={AUDIT_CODE.filename}
            lines={AUDIT_CODE.lines}
          />
        </section>

        {/* Section 4: Idempotency */}
        <section>
          <SectionHeader title={t("mcpSafety.sections.idempotency.title")} subtitle={t("mcpSafety.sections.idempotency.subtitle")} />
          <p className="text-sm text-muted font-mono mb-10 max-w-2xl">
            {t("mcpSafety.sections.idempotency.intro")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {rules.map((rule, idx) => (
              <div
                key={rule.label}
                className="showcase-enter"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <TechBorder className="h-full">
                  <div className="p-5 flex flex-col h-full">
                    <div className="font-bold text-text text-xs uppercase tracking-wider mb-2">
                      {rule.label}
                    </div>
                    <p className="text-xs text-muted font-mono leading-relaxed mb-3 flex-1">
                      {rule.desc}
                    </p>
                    <div className={`font-mono text-xs font-bold ${
                      rule.result.includes("cached") ? "text-success" :
                      rule.result.includes("Conflict") ? "text-error" :
                      "text-primary"
                    }`}>
                      {rule.result}
                    </div>
                  </div>
                </TechBorder>
              </div>
            ))}
          </div>

          <CodeBlock
            filename={IDEMPOTENCY_CODE.filename}
            lines={IDEMPOTENCY_CODE.lines}
          />
          <div className="mt-4 flex items-start gap-2 text-xs font-mono text-muted">
            <Timer size={14} className="text-subtle shrink-0 mt-0.5" />
            {t("mcpSafety.sections.idempotency.ttl")}
          </div>
        </section>

        {/* Section 5: Rate Limiting */}
        <section>
          <SectionHeader title={t("mcpSafety.sections.rateLimit.title")} subtitle={t("mcpSafety.sections.rateLimit.subtitle")} />
          <p className="text-sm text-muted font-mono mb-10 max-w-2xl">
            {t("mcpSafety.sections.rateLimit.intro")}
          </p>

          <div className="border border-border overflow-hidden">
            <div className="grid grid-cols-3 bg-surface-alt border-b border-border px-4 py-2">
              <span className="font-mono text-xs text-subtle uppercase tracking-widest">Route Group</span>
              <span className="font-mono text-xs text-subtle uppercase tracking-widest">Limit</span>
              <span className="font-mono text-xs text-subtle uppercase tracking-widest">Scope</span>
            </div>
            {RATE_LIMIT_GROUPS.map((g) => (
              <div
                key={g.route}
                className="grid grid-cols-3 px-4 py-3 border-b border-border last:border-b-0"
              >
                <span className="font-mono text-xs text-primary font-bold">{g.route}</span>
                <span className="font-mono text-xs text-text tabular-nums">{g.limit}</span>
                <span className="font-mono text-xs text-subtle">{g.scope}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 text-xs font-mono text-muted">
            <Gauge size={14} className="text-warning shrink-0 mt-0.5" />
            {t("mcpSafety.sections.rateLimit.note")}
          </div>
        </section>

        {/* Section 6: Budget Controls */}
        <section>
          <SectionHeader title={t("mcpSafety.sections.budgets.title")} subtitle={t("mcpSafety.sections.budgets.subtitle")} />
          <p className="text-sm text-muted font-mono mb-10 max-w-2xl">
            {t("mcpSafety.sections.budgets.intro")}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {controls.map((ctrl, idx) => (
              <div
                key={ctrl.label}
                className="showcase-enter"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <TechBorder className="h-full">
                  <div className="p-5 flex flex-col h-full">
                    <div className="font-bold text-text text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
                      {ctrl.label.includes("QUIET") || ctrl.label.includes("SILENCIEUSES") ? (
                        <Clock size={14} className="text-success" />
                      ) : (
                        <Fingerprint size={14} className="text-success" />
                      )}
                      {ctrl.label}
                    </div>
                    <p className="text-xs text-muted font-mono leading-relaxed mb-3 flex-1">
                      {ctrl.desc}
                    </p>
                    <div className="bg-bg border border-border p-2 font-mono text-[11px] text-primary">
                      {ctrl.example}
                    </div>
                  </div>
                </TechBorder>
              </div>
            ))}
          </div>
        </section>
      </FeaturePageLayout>
    </>
  );
}
