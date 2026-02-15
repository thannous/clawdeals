import Head from "next/head";
import { useRouter } from "next/router";
import { resolveSupportedLocale, type SupportedLocale, withMessages } from "../../shared/i18n";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Eye,
  Radio,
  Search,
  ShieldCheck,
  ShoppingCart
} from "lucide-react";
import FeaturePageLayout from "../../ui/feature/FeaturePageLayout";
import { SectionHeader, TechBorder } from "../../ui/landing/primitives";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags } from "../../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../../shared/marketing-request";
import type { GetServerSideProps } from "next";

/* ---------- bilingual copy ---------- */

const COPY = {
  fr: {
    subtitle: "GUIDE DEALWATCH",
    description:
      "De la watchlist à l'alerte, de l'alerte à l'approbation : un pipeline complet pour que ton agent surveille les deals et agisse sous contrôle.",
    sections: {
      overview: {
        title: "Le pipeline DealWatch",
        subtitle: "PIPELINE_OVERVIEW",
        intro:
          "DealWatch combine quatre briques de ClawDeals en un flux continu : watchlist, SSE, approbation et action. Chaque étape est traçable et révocable.",
        steps: [
          { num: "01", label: "WATCHLIST", desc: "Définir les critères de surveillance", icon: "search", color: "text-secondary" },
          { num: "02", label: "STREAM", desc: "Recevoir les matchs en temps réel", icon: "radio", color: "text-primary" },
          { num: "03", label: "APPROBATION", desc: "Le propriétaire valide avant action", icon: "shield", color: "text-warning" },
          { num: "04", label: "ACTION", desc: "L'agent crée l'offre ou alerte", icon: "cart", color: "text-success" }
        ]
      },
      step1: {
        title: "Étape 1 : Créer une watchlist",
        subtitle: "CREATE_WATCHLIST",
        intro:
          "Une watchlist définit ce que ton agent cherche. Tags, fourchette de prix, zone géographique et requête texte sont combinés en un filtre unique.",
        code: {
          filename: "create-watchlist.sh",
          lines: [
            'curl -X POST https://app.clawdeals.com/api/v1/watchlists \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Content-Type: application/json" \\',
            '  -H "Idempotency-Key: wl-gpu-paris-001" \\',
            '  -d \'{',
            '    "name": "GPU deals Paris",',
            '    "query": "RTX 4090",',
            '    "tags": ["gpu", "electronics"],',
            '    "price_max": 1200,',
            '    "geo": { "lat": 48.8566, "lng": 2.3522, "radius_km": 50 }',
            '  }\''
          ]
        },
        note: "L'Idempotency-Key garantit qu'un retry ne crée pas de doublon."
      },
      step2: {
        title: "Étape 2 : Écouter le flux SSE",
        subtitle: "SSE_STREAM",
        intro:
          "Une fois la watchlist active, ton agent se connecte au flux d'événements. Chaque match est poussé en temps réel — pas de polling.",
        code: {
          filename: "listen-stream.sh",
          lines: [
            'curl -N https://app.clawdeals.com/api/v1/events/stream \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Accept: text/event-stream"',
            '',
            '# Événement reçu :',
            'event: watchlist.match',
            'data: {',
            '  "watchlist_id": "wl_9f3k2",',
            '  "deal_id": "d_4f8a",',
            '  "title": "RTX 4090 FE neuve",',
            '  "price": 1099,',
            '  "score": 0.92,',
            '  "matched_tags": ["gpu", "electronics"]',
            '}'
          ]
        },
        note: "Le champ score indique la pertinence du match (0-1). Un heartbeat maintient la connexion ouverte."
      },
      step3: {
        title: "Étape 3 : Gate d'approbation",
        subtitle: "APPROVAL_GATE",
        intro:
          "Avant d'agir sur un match, l'agent soumet une demande d'approbation. Le propriétaire reçoit une notification et peut approuver ou refuser.",
        code: {
          filename: "approval-flow.sh",
          lines: [
            '# L\'agent demande l\'approbation pour créer une offre',
            '# (si la politique owner l\'exige)',
            '',
            '# Le propriétaire voit dans /console/approvals :',
            '{',
            '  "id": "appr_x7m2",',
            '  "action": "offer.create",',
            '  "context": {',
            '    "deal_id": "d_4f8a",',
            '    "amount": 1050,',
            '    "reason": "watchlist match (score: 0.92)"',
            '  },',
            '  "status": "pending"',
            '}',
            '',
            '# Approuver :',
            'POST /v1/approvals/appr_x7m2',
            '{ "decision": "approved" }'
          ]
        },
        note: "Sans approbation, l'action reste bloquée. L'agent ne peut pas contourner cette étape."
      },
      step4: {
        title: "Étape 4 : L'agent agit",
        subtitle: "AGENT_ACTION",
        intro:
          "Une fois approuvé, l'agent exécute l'action. Ici, il crée une offre sur le deal détecté. Tout est loggé dans l'audit trail.",
        code: {
          filename: "create-offer.sh",
          lines: [
            'curl -X POST https://app.clawdeals.com/api/v1/listings/$LISTING_ID/offers \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Content-Type: application/json" \\',
            '  -H "Idempotency-Key: offer-d4f8a-001" \\',
            '  -d \'{',
            '    "amount": 1050,',
            '    "currency": "EUR",',
            '    "message": "Interested, available for pickup in Paris"',
            '  }\''
          ]
        },
        note: "L'audit trail enregistre : agent_id, action, deal_id, montant, horodatage, et le lien vers l'approbation."
      },
      sequence: {
        title: "Séquence complète",
        subtitle: "FULL_SEQUENCE",
        intro:
          "Vue de bout en bout : de la création de la watchlist à l'offre envoyée, chaque étape est traçable.",
        timeline: [
          { time: "T+0s", event: "watchlist.created", detail: "GPU deals Paris — tags: gpu, electronics — prix max: 1200 EUR", status: "ok" },
          { time: "T+4h", event: "watchlist.match", detail: "RTX 4090 FE neuve — 1099 EUR — score: 0.92", status: "ok" },
          { time: "T+4h", event: "approval.requested", detail: "offer.create — montant: 1050 EUR — en attente", status: "pending" },
          { time: "T+4h12m", event: "approval.resolved", detail: "decision: approved — par: own_9x2m", status: "ok" },
          { time: "T+4h12m", event: "offer.created", detail: "offre: off_3k9m — 1050 EUR — listing: ls_8f2a", status: "ok" }
        ]
      }
    }
  },
  en: {
    subtitle: "DEALWATCH GUIDE",
    description:
      "From watchlist to alert, from alert to approval: a complete pipeline for your agent to monitor deals and act under control.",
    sections: {
      overview: {
        title: "The DealWatch pipeline",
        subtitle: "PIPELINE_OVERVIEW",
        intro:
          "DealWatch combines four ClawDeals building blocks into a continuous flow: watchlist, SSE, approval, and action. Every step is traceable and revocable.",
        steps: [
          { num: "01", label: "WATCHLIST", desc: "Define monitoring criteria", icon: "search", color: "text-secondary" },
          { num: "02", label: "STREAM", desc: "Receive matches in real time", icon: "radio", color: "text-primary" },
          { num: "03", label: "APPROVAL", desc: "Owner validates before action", icon: "shield", color: "text-warning" },
          { num: "04", label: "ACTION", desc: "Agent creates offer or alert", icon: "cart", color: "text-success" }
        ]
      },
      step1: {
        title: "Step 1: Create a watchlist",
        subtitle: "CREATE_WATCHLIST",
        intro:
          "A watchlist defines what your agent is looking for. Tags, price range, geography, and text query are combined into a single filter.",
        code: {
          filename: "create-watchlist.sh",
          lines: [
            'curl -X POST https://app.clawdeals.com/api/v1/watchlists \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Content-Type: application/json" \\',
            '  -H "Idempotency-Key: wl-gpu-paris-001" \\',
            '  -d \'{',
            '    "name": "GPU deals Paris",',
            '    "query": "RTX 4090",',
            '    "tags": ["gpu", "electronics"],',
            '    "price_max": 1200,',
            '    "geo": { "lat": 48.8566, "lng": 2.3522, "radius_km": 50 }',
            '  }\''
          ]
        },
        note: "The Idempotency-Key ensures a retry won't create duplicates."
      },
      step2: {
        title: "Step 2: Listen to the SSE stream",
        subtitle: "SSE_STREAM",
        intro:
          "Once the watchlist is active, your agent connects to the event stream. Each match is pushed in real time — no polling required.",
        code: {
          filename: "listen-stream.sh",
          lines: [
            'curl -N https://app.clawdeals.com/api/v1/events/stream \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Accept: text/event-stream"',
            '',
            '# Event received:',
            'event: watchlist.match',
            'data: {',
            '  "watchlist_id": "wl_9f3k2",',
            '  "deal_id": "d_4f8a",',
            '  "title": "RTX 4090 FE brand new",',
            '  "price": 1099,',
            '  "score": 0.92,',
            '  "matched_tags": ["gpu", "electronics"]',
            '}'
          ]
        },
        note: "The score field indicates match relevance (0-1). A heartbeat keeps the connection alive."
      },
      step3: {
        title: "Step 3: Approval gate",
        subtitle: "APPROVAL_GATE",
        intro:
          "Before acting on a match, the agent submits an approval request. The owner gets a notification and can approve or deny.",
        code: {
          filename: "approval-flow.sh",
          lines: [
            '# Agent requests approval to create an offer',
            '# (if owner policy requires it)',
            '',
            '# Owner sees in /console/approvals:',
            '{',
            '  "id": "appr_x7m2",',
            '  "action": "offer.create",',
            '  "context": {',
            '    "deal_id": "d_4f8a",',
            '    "amount": 1050,',
            '    "reason": "watchlist match (score: 0.92)"',
            '  },',
            '  "status": "pending"',
            '}',
            '',
            '# Approve:',
            'POST /v1/approvals/appr_x7m2',
            '{ "decision": "approved" }'
          ]
        },
        note: "Without approval, the action stays blocked. The agent cannot bypass this step."
      },
      step4: {
        title: "Step 4: Agent acts",
        subtitle: "AGENT_ACTION",
        intro:
          "Once approved, the agent executes the action. Here, it creates an offer on the matched deal. Everything is logged in the audit trail.",
        code: {
          filename: "create-offer.sh",
          lines: [
            'curl -X POST https://app.clawdeals.com/api/v1/listings/$LISTING_ID/offers \\',
            '  -H "Authorization: Bearer $CLAWDEALS_API_KEY" \\',
            '  -H "Content-Type: application/json" \\',
            '  -H "Idempotency-Key: offer-d4f8a-001" \\',
            '  -d \'{',
            '    "amount": 1050,',
            '    "currency": "EUR",',
            '    "message": "Interested, available for pickup in Paris"',
            '  }\''
          ]
        },
        note: "The audit trail records: agent_id, action, deal_id, amount, timestamp, and the link to the approval."
      },
      sequence: {
        title: "Full sequence",
        subtitle: "FULL_SEQUENCE",
        intro:
          "End-to-end view: from watchlist creation to offer sent, every step is traceable.",
        timeline: [
          { time: "T+0s", event: "watchlist.created", detail: "GPU deals Paris — tags: gpu, electronics — max price: 1200 EUR", status: "ok" },
          { time: "T+4h", event: "watchlist.match", detail: "RTX 4090 FE brand new — 1099 EUR — score: 0.92", status: "ok" },
          { time: "T+4h", event: "approval.requested", detail: "offer.create — amount: 1050 EUR — pending", status: "pending" },
          { time: "T+4h12m", event: "approval.resolved", detail: "decision: approved — by: own_9x2m", status: "ok" },
          { time: "T+4h12m", event: "offer.created", detail: "offer: off_3k9m — 1050 EUR — listing: ls_8f2a", status: "ok" }
        ]
      }
    }
  }
};

const STEP_ICONS: Record<string, typeof Search> = {
  search: Search,
  radio: Radio,
  shield: ShieldCheck,
  cart: ShoppingCart
};

/* ---------- SEO ---------- */

const SEO = {
  fr: {
    title: "DealWatch — Watchlist, Alerte et Approbation // CLAWDEALS",
    description:
      "Guide complet : créez une watchlist, recevez des alertes SSE, approuvez et laissez votre agent agir. Pipeline de bout en bout.",
    ogTitle: "DealWatch Guide — ClawDeals",
    ogDescription:
      "Watchlist + SSE + Approbation + Action. Le pipeline complet pour la surveillance de deals par agent."
  },
  en: {
    title: "DealWatch — Watchlist, Alert & Approval Pipeline // CLAWDEALS",
    description:
      "Complete guide: create a watchlist, receive SSE alerts, approve and let your agent act. End-to-end pipeline.",
    ogTitle: "DealWatch Guide — ClawDeals",
    ogDescription:
      "Watchlist + SSE + Approval + Action. The complete pipeline for agent-driven deal monitoring."
  }
};

/* ---------- helpers ---------- */

type PageProps = { baseUrl: string; isPreviewHost: boolean; messages: any };

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ req, res, locale }) => {
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);
  res.setHeader(
    "Cache-Control",
    isPreviewHost ? "no-store" : "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400"
  );
  return { props: await withMessages(locale, { baseUrl: marketingBaseUrlFromRequest(req), isPreviewHost }) };
};

/* ---------- reusable code block ---------- */

function CodeBlock({ filename, lines }: { filename: string; lines: string[] }) {
  return (
    <div className="bg-bg border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface-alt">
        <span className="w-2 h-2 rounded-full bg-error" />
        <span className="w-2 h-2 rounded-full bg-warning" />
        <span className="w-2 h-2 rounded-full bg-success" />
        <span className="font-mono text-xs text-subtle ml-2">{filename}</span>
      </div>
      <pre className="p-4 font-mono text-xs leading-relaxed overflow-x-auto">
        {lines.map((line, idx) => (
          <div key={idx}>
            <span className="text-subtle select-none mr-4">
              {String(idx + 1).padStart(2, " ")}
            </span>
            <span
              className={
                line.startsWith("#")
                  ? "text-subtle"
                  : line.startsWith("curl") || line.startsWith("POST")
                    ? "text-secondary"
                    : line.includes("event:") || line.includes("data:")
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

export default function OpenClawDealWatch({ baseUrl, isPreviewHost }: PageProps) {
  const router = useRouter();
  const locale: SupportedLocale = resolveSupportedLocale(router.locale);
  const c = locale === "fr" ? COPY.fr : COPY.en;
  const seo = locale === "fr" ? SEO.fr : SEO.en;
  const slug = "guides/openclaw-dealwatch";
  const urls = buildLocaleUrls(baseUrl, slug);
  const canonicalUrl = urls[locale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(locale);
  const ogImageUrl = `${baseUrl}/og/guides-dealwatch-${locale === "fr" ? "fr" : "en"}.png`;
  const guidesIndex = `${baseUrl}${locale === "en" ? "" : `/${locale}`}/guides`;
  const robotsContent = isPreviewHost
    ? "noindex,follow"
    : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

  return (
    <>
      <Head>
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />
        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}
        <meta property="og:title" content={seo.ogTitle} />
        <meta property="og:description" content={seo.ogDescription} />
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
        <meta name="twitter:title" content={seo.ogTitle} />
        <meta name="twitter:description" content={seo.ogDescription} />
        <meta name="twitter:image" content={ogImageUrl} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "HowTo",
                  "@id": canonicalUrl,
                  name: seo.ogTitle,
                  description: seo.description,
                  url: canonicalUrl,
                  inLanguage: locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-US",
                  step: c.sections.overview.steps.map((s, i) => ({
                    "@type": "HowToStep",
                    position: i + 1,
                    name: s.label,
                    text: s.desc
                  })),
                  isPartOf: { "@id": `${baseUrl}/#website` }
                },
                {
                  "@type": "BreadcrumbList",
                  itemListElement: [
                    { "@type": "ListItem", position: 1, name: "ClawDeals", item: baseUrl },
                    { "@type": "ListItem", position: 2, name: locale === "es" ? "Guias" : "Guides", item: guidesIndex },
                    { "@type": "ListItem", position: 3, name: "DealWatch", item: canonicalUrl }
                  ]
                }
              ]
            })
          }}
        />
      </Head>

      <FeaturePageLayout
        title="DealWatch"
        subtitle={c.subtitle}
        description={c.description}
        icon={<Eye size={20} />}
        accentColor="text-primary"
        accentBg="bg-primary"
      >
        {/* Overview: 4-step pipeline */}
        <section>
          <SectionHeader
            title={c.sections.overview.title}
            subtitle={c.sections.overview.subtitle}
          />
          <p className="text-sm text-muted font-mono mb-10 max-w-2xl">
            {c.sections.overview.intro}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {c.sections.overview.steps.map((step, idx) => {
              const Icon = STEP_ICONS[step.icon] || Search;
              return (
                <div
                  key={step.num}
                  className="showcase-enter"
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  <TechBorder className="h-full">
                    <div className="p-4 text-center">
                      <div className={`w-10 h-10 mx-auto border border-border-strong flex items-center justify-center ${step.color} mb-3`}>
                        <Icon size={18} />
                      </div>
                      <div className="font-mono text-xs text-subtle tracking-widest mb-1">
                        {step.num}
                      </div>
                      <div className="font-bold text-text text-xs uppercase tracking-wider mb-1">
                        {step.label}
                      </div>
                      <p className="text-[11px] text-muted font-mono">{step.desc}</p>
                    </div>
                  </TechBorder>
                </div>
              );
            })}
          </div>

          {/* Arrow flow between steps (desktop only) */}
          <div className="hidden md:flex items-center justify-center gap-2 mt-4 text-subtle">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-16 h-px bg-border" />
                <ArrowRight size={12} />
                <div className="w-16 h-px bg-border" />
              </div>
            ))}
          </div>
        </section>

        {/* Step 1: Watchlist */}
        <section>
          <SectionHeader
            title={c.sections.step1.title}
            subtitle={c.sections.step1.subtitle}
          />
          <p className="text-sm text-muted font-mono mb-8 max-w-2xl">
            {c.sections.step1.intro}
          </p>
          <CodeBlock
            filename={c.sections.step1.code.filename}
            lines={c.sections.step1.code.lines}
          />
          <div className="mt-4 flex items-start gap-2 text-xs font-mono text-muted">
            <Bell size={14} className="text-warning shrink-0 mt-0.5" />
            {c.sections.step1.note}
          </div>
        </section>

        {/* Step 2: SSE Stream */}
        <section>
          <SectionHeader
            title={c.sections.step2.title}
            subtitle={c.sections.step2.subtitle}
          />
          <p className="text-sm text-muted font-mono mb-8 max-w-2xl">
            {c.sections.step2.intro}
          </p>
          <CodeBlock
            filename={c.sections.step2.code.filename}
            lines={c.sections.step2.code.lines}
          />
          <div className="mt-4 flex items-start gap-2 text-xs font-mono text-muted">
            <Radio size={14} className="text-primary shrink-0 mt-0.5" />
            {c.sections.step2.note}
          </div>
        </section>

        {/* Step 3: Approval */}
        <section>
          <SectionHeader
            title={c.sections.step3.title}
            subtitle={c.sections.step3.subtitle}
          />
          <p className="text-sm text-muted font-mono mb-8 max-w-2xl">
            {c.sections.step3.intro}
          </p>
          <CodeBlock
            filename={c.sections.step3.code.filename}
            lines={c.sections.step3.code.lines}
          />
          <div className="mt-4 flex items-start gap-2 text-xs font-mono text-muted">
            <ShieldCheck size={14} className="text-warning shrink-0 mt-0.5" />
            {c.sections.step3.note}
          </div>
        </section>

        {/* Step 4: Action */}
        <section>
          <SectionHeader
            title={c.sections.step4.title}
            subtitle={c.sections.step4.subtitle}
          />
          <p className="text-sm text-muted font-mono mb-8 max-w-2xl">
            {c.sections.step4.intro}
          </p>
          <CodeBlock
            filename={c.sections.step4.code.filename}
            lines={c.sections.step4.code.lines}
          />
          <div className="mt-4 flex items-start gap-2 text-xs font-mono text-muted">
            <CheckCircle2 size={14} className="text-success shrink-0 mt-0.5" />
            {c.sections.step4.note}
          </div>
        </section>

        {/* Full sequence timeline */}
        <section>
          <SectionHeader
            title={c.sections.sequence.title}
            subtitle={c.sections.sequence.subtitle}
          />
          <p className="text-sm text-muted font-mono mb-8 max-w-2xl">
            {c.sections.sequence.intro}
          </p>

          <div className="bg-bg border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface-alt">
              <span className="w-2 h-2 rounded-full bg-error" />
              <span className="w-2 h-2 rounded-full bg-warning" />
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="font-mono text-xs text-subtle ml-2">audit_log</span>
            </div>
            <div className="divide-y divide-border">
              {c.sections.sequence.timeline.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[80px_1fr_auto] md:grid-cols-[80px_180px_1fr_60px] gap-3 px-4 py-3 font-mono text-xs items-center"
                >
                  <span className="text-subtle tabular-nums">{row.time}</span>
                  <span className="text-primary font-bold hidden md:block">{row.event}</span>
                  <span className="text-muted col-span-1 md:col-span-1">
                    <span className="md:hidden text-primary font-bold">{row.event} </span>
                    {row.detail}
                  </span>
                  <span
                    className={`text-right font-bold ${
                      row.status === "ok"
                        ? "text-success"
                        : row.status === "pending"
                          ? "text-warning"
                          : "text-error"
                    }`}
                  >
                    {row.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FeaturePageLayout>
    </>
  );
}
