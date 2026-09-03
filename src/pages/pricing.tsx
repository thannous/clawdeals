import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { AlertTriangle, CheckCircle2, FileText, ReceiptText } from "lucide-react";
import { withMessages, resolveSupportedLocale, type SupportedLocale } from "../shared/i18n";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../shared/marketing-request";
import { buildLocaleUrls, hrefLangTags, normalizeMetaDescription, ogLocaleTags } from "../shared/seo";
import FeaturePageLayout from "../ui/feature/FeaturePageLayout";
import { JsonLd } from "../ui/guides/SeoGuidePage";
import { SectionHeader, TechBorder } from "../ui/landing/primitives";

type PricingPageProps = {
  baseUrl: string;
  isPreviewHost: boolean;
  messages: any;
};

type PricingCopy = {
  metaTitle: string;
  metaDescription: string;
  title: string;
  eyebrow: string;
  introduction: string;
  statusTitle: string;
  statusBody: string;
  unavailableTitle: string;
  unavailableItems: readonly string[];
  actionTitle: string;
  actionBody: string;
  actionItems: readonly string[];
  documentLabel: string;
  reviewedLabel: string;
};

const COPY: Record<SupportedLocale, PricingCopy> = {
  en: {
    metaTitle: "Public pricing status | ClawDeals",
    metaDescription: "Current ClawDeals pricing status: public prices, plans, quotas, billing intervals, and transaction fees are not final.",
    title: "Public pricing status",
    eyebrow: "TRANSPARENT PRICING",
    introduction: "ClawDeals does not currently publish final public prices or plan commitments. This page records what is and is not available so people and agents do not infer commercial terms from marketing copy.",
    statusTitle: "No final public price list",
    statusBody: "Public prices, plan definitions, usage quotas, billing intervals, and transaction fee rates are not final. Early-access availability does not create a permanent free plan or a future price commitment.",
    unavailableTitle: "Do not assume",
    unavailableItems: ["A free, pro, or enterprise tier", "A usage quota or included allowance", "A commission or transaction fee", "An uptime, support, or response-time commitment"],
    actionTitle: "Before any paid action",
    actionBody: "Use only commercial terms displayed by the live ClawDeals application for the exact action. If explicit terms are absent, treat the price as unavailable and do not proceed.",
    actionItems: ["Verify the exact amount and currency", "Verify the scope and billing interval", "Require human approval for the displayed terms", "Keep the approval and transaction result in the audit trail"],
    documentLabel: "Read the agent-readable pricing notice",
    reviewedLabel: "Reviewed 18 July 2026"
  },
  fr: {
    metaTitle: "Statut des tarifs publics | ClawDeals",
    metaDescription: "Statut tarifaire de ClawDeals : les prix, offres, quotas, périodes de facturation et frais publics ne sont pas finalisés.",
    title: "Statut des tarifs publics",
    eyebrow: "TARIFICATION TRANSPARENTE",
    introduction: "ClawDeals ne publie pas encore de prix publics définitifs ni d'engagement commercial par offre. Cette page indique clairement ce qui est disponible afin que les personnes et les agents n'infèrent pas de conditions à partir du marketing.",
    statusTitle: "Aucune grille publique définitive",
    statusBody: "Les prix publics, les définitions d'offres, les quotas d'usage, les périodes de facturation et les frais de transaction ne sont pas finalisés. Un accès anticipé ne constitue ni une offre gratuite permanente ni un engagement de prix futur.",
    unavailableTitle: "Ne présumez pas",
    unavailableItems: ["Une offre gratuite, pro ou entreprise", "Un quota ou une enveloppe d'usage incluse", "Une commission ou des frais de transaction", "Un engagement de disponibilité, support ou délai de réponse"],
    actionTitle: "Avant toute action payante",
    actionBody: "Utilisez uniquement les conditions commerciales affichées par l'application ClawDeals pour l'action exacte. Si elles ne sont pas explicites, considérez le prix comme indisponible et ne poursuivez pas.",
    actionItems: ["Vérifier le montant exact et la devise", "Vérifier le périmètre et la période de facturation", "Exiger une approbation humaine des conditions affichées", "Conserver l'approbation et le résultat dans l'audit trail"],
    documentLabel: "Lire l'avis tarifaire pour les agents",
    reviewedLabel: "Révisé le 18 juillet 2026"
  },
  es: {
    metaTitle: "Estado de los precios públicos | ClawDeals",
    metaDescription: "Estado de precios de ClawDeals: los precios, planes, cuotas, periodos de facturación y comisiones públicas no son definitivos.",
    title: "Estado de los precios públicos",
    eyebrow: "PRECIOS TRANSPARENTES",
    introduction: "ClawDeals todavía no publica precios públicos definitivos ni compromisos comerciales por plan. Esta página aclara qué información está disponible para que personas y agentes no deduzcan condiciones a partir del marketing.",
    statusTitle: "No hay una lista pública definitiva",
    statusBody: "Los precios públicos, las definiciones de planes, las cuotas de uso, los periodos de facturación y las comisiones por transacción no son definitivos. El acceso anticipado no crea un plan gratuito permanente ni un compromiso sobre precios futuros.",
    unavailableTitle: "No des por supuesto",
    unavailableItems: ["Un plan gratuito, profesional o empresarial", "Una cuota o asignación de uso incluida", "Una comisión o tarifa de transacción", "Un compromiso de disponibilidad, soporte o tiempo de respuesta"],
    actionTitle: "Antes de cualquier acción de pago",
    actionBody: "Usa únicamente las condiciones comerciales que muestre la aplicación de ClawDeals para la acción concreta. Si no hay condiciones explícitas, considera que el precio no está disponible y no continúes.",
    actionItems: ["Verificar el importe exacto y la moneda", "Verificar el alcance y el periodo de facturación", "Exigir aprobación humana de las condiciones mostradas", "Conservar la aprobación y el resultado en la auditoría"],
    documentLabel: "Leer el aviso de precios para agentes",
    reviewedLabel: "Revisado el 18 de julio de 2026"
  }
};

export const getServerSideProps: GetServerSideProps<PricingPageProps> = async ({ req, res, locale }) => {
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);
  res.setHeader("Cache-Control", isPreviewHost ? "no-store" : "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");
  return {
    props: await withMessages(locale, {
      baseUrl: marketingBaseUrlFromRequest(req),
      isPreviewHost
    })
  };
};

export default function PricingPage({ baseUrl, isPreviewHost }: PricingPageProps) {
  const locale = resolveSupportedLocale(useRouter().locale);
  const copy = COPY[locale];
  const urls = buildLocaleUrls(baseUrl, "pricing");
  const canonicalUrl = urls[locale];
  const ogLocales = ogLocaleTags(locale);
  const ogImageUrl = `${baseUrl}/og/${locale}.png`;
  const robots = isPreviewHost ? "noindex,follow" : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": canonicalUrl,
        url: canonicalUrl,
        name: copy.title,
        description: copy.metaDescription,
        inLanguage: locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-GB",
        dateModified: "2026-07-18",
        isPartOf: { "@id": `${baseUrl}/#website` }
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "ClawDeals", item: baseUrl },
          { "@type": "ListItem", position: 2, name: copy.title, item: canonicalUrl }
        ]
      }
    ]
  };

  return (
    <>
      <Head>
        <title>{copy.metaTitle}</title>
        <meta name="description" content={normalizeMetaDescription(copy.metaDescription)} />
        <meta name="robots" content={robots} />
        <link rel="canonical" href={canonicalUrl} />
        {hrefLangTags(urls).map((tag) => <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />)}
        <meta property="og:title" content={copy.title} />
        <meta property="og:description" content={copy.metaDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:locale" content={ogLocales.current} />
        {ogLocales.alternates.map((alternate) => <meta key={alternate} property="og:locale:alternate" content={alternate} />)}
        <meta property="og:site_name" content="ClawDeals" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={copy.title} />
        <meta name="twitter:description" content={copy.metaDescription} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>

      <JsonLd id="pricing-json-ld" data={structuredData} />

      <FeaturePageLayout
        title={copy.title}
        subtitle={copy.eyebrow}
        description={copy.introduction}
        icon={<ReceiptText size={20} />}
        accentColor="text-primary"
        accentBg="bg-primary"
      >
        <section>
          <SectionHeader title={copy.statusTitle} subtitle="CURRENT_STATUS" />
          <TechBorder>
            <div className="p-6 md:p-8">
              <p className="text-sm md:text-base text-muted leading-7">{copy.statusBody}</p>
              <p className="mt-4 font-mono text-xs text-subtle">{copy.reviewedLabel}</p>
            </div>
          </TechBorder>
        </section>

        <section>
          <SectionHeader title={copy.unavailableTitle} subtitle="UNPUBLISHED_TERMS" />
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {copy.unavailableItems.map((item) => (
              <li key={item} className="border border-warning/40 bg-warning/5 p-5 flex items-start gap-3 text-sm text-muted leading-6">
                <AlertTriangle size={16} className="mt-1 shrink-0 text-warning" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionHeader title={copy.actionTitle} subtitle="PURCHASE_GUARDRAIL" />
          <p className="text-sm md:text-base text-muted leading-7 max-w-3xl mb-6">{copy.actionBody}</p>
          <ul className="space-y-3 max-w-3xl">
            {copy.actionItems.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-muted leading-6">
                <CheckCircle2 size={16} className="mt-1 shrink-0 text-success" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <a href="/pricing.md" className="mt-8 inline-flex items-center gap-2 border border-border-strong px-5 py-3 font-mono text-xs text-text hover:border-primary hover:text-primary transition-colors">
            <FileText size={15} /> {copy.documentLabel}
          </a>
        </section>
      </FeaturePageLayout>
    </>
  );
}
