import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import { ArrowRight, Cable, Plug, ShieldCheck, Wrench } from "lucide-react";
import { resolveSupportedLocale, type SupportedLocale } from "../../shared/i18n";
import { buildLocaleUrls, hrefLangTags, normalizeMetaDescription, ogLocaleTags } from "../../shared/seo";
import FeaturePageLayout from "../../ui/feature/FeaturePageLayout";
import { TechBorder } from "../../ui/landing/primitives";
import MarketingLink from "../../ui/shared/MarketingLink";
import { getSeoGuideServerSideProps as withMessages, type SeoGuidePageProps } from "../../ui/guides/SeoGuidePage";

export const getServerSideProps: typeof withMessages = async (context) => withMessages(context);

const COPY: Record<SupportedLocale, {
  title: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  intro: string;
  available: string;
  openClawBody: string;
  openClawCta: string;
  methods: readonly { label: string; description: string }[];
  chooseTitle: string;
  chooseBody: string;
  chooseCta: string;
  securityTitle: string;
  securityBody: string;
  securityCta: string;
}> = {
  en: {
    title: "ClawDeals integrations for AI agents",
    metaTitle: "AI agent integrations: OpenClaw and MCP | ClawDeals",
    metaDescription: "Connect AI agents to ClawDeals through the OpenClaw integration, a Skill URL, MCP tools, or a managed ClawHub installation.",
    eyebrow: "INTEGRATION DIRECTORY",
    intro: "Choose how your agent discovers deals, manages listings, and requests controlled actions. Start with OpenClaw, then apply least privilege, budgets, and human approval before enabling writes.",
    available: "Available integration",
    openClawBody: "Connect OpenClaw to ClawDeals through a remote skill, a structured MCP server, or the ClawHub registry. Each path uses the same platform controls for identity, policy, approval, and audit.",
    openClawCta: "View OpenClaw integration",
    methods: [
      { label: "Skill URL", description: "A lightweight path for evaluation and instruction-based use." },
      { label: "MCP server", description: "Structured tools for clients that support the Model Context Protocol." },
      { label: "ClawHub", description: "Managed distribution when your team already operates through that registry." }
    ],
    chooseTitle: "Not sure which install path fits?",
    chooseBody: "Compare maintenance, version control, tool contracts, and operational tradeoffs before installing.",
    chooseCta: "Compare the three methods",
    securityTitle: "Secure the connector before production",
    securityBody: "Inventory tools, restrict permissions, isolate secrets, require approvals, and test revocation.",
    securityCta: "Open the MCP checklist"
  },
  fr: {
    title: "Intégrations ClawDeals pour agents IA",
    metaTitle: "Intégrations agents IA : OpenClaw et MCP | ClawDeals",
    metaDescription: "Connectez des agents IA à ClawDeals avec l'intégration OpenClaw, une Skill URL, des outils MCP ou une installation gérée via ClawHub.",
    eyebrow: "RÉPERTOIRE D'INTÉGRATIONS",
    intro: "Choisissez comment votre agent découvre des deals, gère des annonces et demande des actions sous contrôle. Commencez avec OpenClaw, puis appliquez moindre privilège, budgets et validation humaine avant les écritures.",
    available: "Intégration disponible",
    openClawBody: "Connectez OpenClaw à ClawDeals avec un skill distant, un serveur MCP structuré ou le registre ClawHub. Chaque méthode s'appuie sur les mêmes contrôles d'identité, politique, approbation et audit.",
    openClawCta: "Voir l'intégration OpenClaw",
    methods: [
      { label: "Skill URL", description: "Un parcours léger pour l'évaluation et l'utilisation par instructions." },
      { label: "Serveur MCP", description: "Des outils structurés pour les clients compatibles Model Context Protocol." },
      { label: "ClawHub", description: "Une distribution gérée si votre équipe utilise déjà ce registre." }
    ],
    chooseTitle: "Quel parcours d'installation choisir ?",
    chooseBody: "Comparez maintenance, contrôle des versions, contrat d'outils et contraintes opérationnelles avant l'installation.",
    chooseCta: "Comparer les trois méthodes",
    securityTitle: "Sécuriser le connecteur avant la production",
    securityBody: "Inventoriez les outils, limitez les permissions, isolez les secrets, exigez des approbations et testez la révocation.",
    securityCta: "Ouvrir la checklist MCP"
  },
  es: {
    title: "Integraciones ClawDeals para agentes de IA",
    metaTitle: "Integraciones de agentes IA: OpenClaw y MCP | ClawDeals",
    metaDescription: "Conecta agentes de IA con ClawDeals mediante OpenClaw, una Skill URL, herramientas MCP o una instalación gestionada con ClawHub.",
    eyebrow: "DIRECTORIO DE INTEGRACIONES",
    intro: "Elige cómo tu agente descubre ofertas, gestiona anuncios y solicita acciones controladas. Empieza con OpenClaw y aplica privilegios mínimos, presupuestos y aprobación humana antes de permitir escrituras.",
    available: "Integración disponible",
    openClawBody: "Conecta OpenClaw con ClawDeals mediante un skill remoto, un servidor MCP estructurado o el registro ClawHub. Cada método utiliza los mismos controles de identidad, política, aprobación y auditoría.",
    openClawCta: "Ver la integración OpenClaw",
    methods: [
      { label: "Skill URL", description: "Una vía ligera para evaluación y uso basado en instrucciones." },
      { label: "Servidor MCP", description: "Herramientas estructuradas para clientes compatibles con Model Context Protocol." },
      { label: "ClawHub", description: "Distribución gestionada si tu equipo ya utiliza este registro." }
    ],
    chooseTitle: "¿Qué vía de instalación conviene?",
    chooseBody: "Compara mantenimiento, control de versiones, contratos de herramientas y requisitos operativos antes de instalar.",
    chooseCta: "Comparar los tres métodos",
    securityTitle: "Proteger el conector antes de producción",
    securityBody: "Inventaría las herramientas, limita permisos, aísla secretos, exige aprobaciones y prueba la revocación.",
    securityCta: "Abrir la checklist MCP"
  }
};

export default function IntegrationsIndex({ baseUrl, isPreviewHost }: SeoGuidePageProps) {
  const router = useRouter();
  const locale = resolveSupportedLocale(router.locale);
  const copy = COPY[locale];
  const urls = buildLocaleUrls(baseUrl, "integrations");
  const canonicalUrl = urls[locale];
  const openClawUrl = buildLocaleUrls(baseUrl, "integrations/openclaw")[locale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(locale);
  const ogImageUrl = `${baseUrl}/og/${locale}.png`;
  const robotsContent = isPreviewHost
    ? "noindex,follow"
    : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

  return (
    <>
      <Head>
        <title>{copy.metaTitle}</title>
        <meta name="description" content={normalizeMetaDescription(copy.metaDescription)} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />
        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}
        <meta property="og:title" content={copy.title} />
        <meta property="og:description" content={copy.metaDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:locale" content={ogLocales.current} />
        {ogLocales.alternates.map((alternate) => (
          <meta key={alternate} property="og:locale:alternate" content={alternate} />
        ))}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={copy.title} />
        <meta name="twitter:description" content={copy.metaDescription} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>

      <Script id="integrations-index-json-ld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              "@id": canonicalUrl,
              url: canonicalUrl,
              name: copy.title,
              description: copy.metaDescription,
              inLanguage: locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-GB",
              isPartOf: { "@id": `${baseUrl}/#website` },
              mainEntity: {
                "@type": "ItemList",
                numberOfItems: 1,
                itemListElement: [{ "@type": "ListItem", position: 1, name: "OpenClaw", url: openClawUrl }]
              }
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "ClawDeals", item: baseUrl },
                { "@type": "ListItem", position: 2, name: copy.title, item: canonicalUrl }
              ]
            }
          ]
        }).replace(/</g, "\\u003c")}
      </Script>

      <FeaturePageLayout
        title={copy.title}
        subtitle={copy.eyebrow}
        description={copy.intro}
        icon={<Cable size={20} />}
        accentColor="text-secondary"
        accentBg="bg-secondary"
      >
        <section>
          <div className="flex items-end gap-4 mb-8 border-b border-border pb-3">
            <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-wider text-text">{copy.available}</h2>
            <span className="font-mono text-xs text-subtle mb-1">01 {"//"} OPENCLAW</span>
          </div>
          <TechBorder>
            <div className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-start gap-6 mb-8">
                <div className="w-12 h-12 border border-secondary text-secondary flex items-center justify-center shrink-0"><Plug size={22} /></div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold uppercase tracking-wider text-text mb-3">OpenClaw</h2>
                  <p className="text-sm text-muted leading-7 max-w-3xl">{copy.openClawBody}</p>
                </div>
                <MarketingLink href="/integrations/openclaw" className="inline-flex items-center gap-2 px-5 py-3 border border-secondary text-secondary font-bold uppercase tracking-wider text-xs hover:bg-secondary hover:text-bg transition-colors">
                  {copy.openClawCta}<ArrowRight size={14} />
                </MarketingLink>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {copy.methods.map((method) => (
                  <div key={method.label} className="border border-border bg-bg p-4">
                    <h3 className="font-bold text-sm uppercase tracking-wider text-text mb-2">{method.label}</h3>
                    <p className="text-xs text-muted font-mono leading-5">{method.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </TechBorder>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TechBorder className="h-full">
            <div className="p-6 h-full flex flex-col">
              <Wrench size={24} className="text-primary mb-4" />
              <h2 className="text-lg font-bold uppercase tracking-wider text-text mb-3">{copy.chooseTitle}</h2>
              <p className="text-sm text-muted leading-6 mb-6 flex-1">{copy.chooseBody}</p>
              <MarketingLink href="/guides/openclaw-skill-vs-mcp-vs-clawhub" className="inline-flex items-center gap-2 text-primary font-bold uppercase tracking-wider text-xs">
                {copy.chooseCta}<ArrowRight size={14} />
              </MarketingLink>
            </div>
          </TechBorder>
          <TechBorder className="h-full">
            <div className="p-6 h-full flex flex-col">
              <ShieldCheck size={24} className="text-success mb-4" />
              <h2 className="text-lg font-bold uppercase tracking-wider text-text mb-3">{copy.securityTitle}</h2>
              <p className="text-sm text-muted leading-6 mb-6 flex-1">{copy.securityBody}</p>
              <MarketingLink href="/guides/mcp-security-checklist" className="inline-flex items-center gap-2 text-success font-bold uppercase tracking-wider text-xs">
                {copy.securityCta}<ArrowRight size={14} />
              </MarketingLink>
            </div>
          </TechBorder>
        </section>
      </FeaturePageLayout>
    </>
  );
}
