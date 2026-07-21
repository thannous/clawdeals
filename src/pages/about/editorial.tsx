import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { BookCheck, CheckCircle2, ExternalLink, RefreshCw, Users } from "lucide-react";
import { withMessages, resolveSupportedLocale, type SupportedLocale } from "../../shared/i18n";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../../shared/marketing-request";
import { buildLocaleUrls, hrefLangTags, normalizeMetaDescription, ogLocaleTags } from "../../shared/seo";
import FeaturePageLayout from "../../ui/feature/FeaturePageLayout";
import { JsonLd } from "../../ui/guides/SeoGuidePage";
import { SectionHeader, TechBorder } from "../../ui/landing/primitives";

type EditorialPageProps = {
  baseUrl: string;
  isPreviewHost: boolean;
  messages: any;
};

type EditorialCopy = {
  metaTitle: string;
  metaDescription: string;
  title: string;
  eyebrow: string;
  introduction: string;
  identityTitle: string;
  identityBody: string;
  methodTitle: string;
  methodIntro: string;
  methodItems: readonly string[];
  sourcesTitle: string;
  sourcesBody: string;
  sourcesItems: readonly string[];
  correctionsTitle: string;
  correctionsBody: string;
  reviewedLabel: string;
};

const COPY: Record<SupportedLocale, EditorialCopy> = {
  en: {
    metaTitle: "Editorial standards and review | ClawDeals",
    metaDescription: "How the ClawDeals Editorial Team researches, reviews, dates, sources, and corrects its marketplace and agent-security guides.",
    title: "Editorial standards and review",
    eyebrow: "CLAWDEALS EDITORIAL TEAM",
    introduction: "ClawDeals guides are published by an organisational editorial team. We do not attribute articles to invented individuals or credentials. This page explains the review evidence readers can expect.",
    identityTitle: "Who publishes the guides",
    identityBody: "The ClawDeals Editorial Team owns the guide registry, localisation, source links, and correction history. The byline identifies the organisation responsible for the content; it is not a claim that a named external expert reviewed every page.",
    methodTitle: "Review method",
    methodIntro: "For operational, security, and marketplace guidance, the team applies the following checks before changing the published review date.",
    methodItems: ["Separate product behaviour from general recommendations", "Check technical claims against primary official documentation", "Remove unsupported timing, price, performance, or availability claims", "Keep examples clearly framed as examples rather than universal thresholds", "Verify that visible content, metadata, and structured data describe the same page"],
    sourcesTitle: "Source policy",
    sourcesBody: "Guides link to primary documentation close to the claims it supports. ClawDeals product controls link to public first-party manifests or product pages; protocol and security guidance links to its maintainers, standards bodies, or public agencies.",
    sourcesItems: ["OpenClaw documentation for Skills and ClawHub behaviour", "Model Context Protocol documentation for MCP client and server security", "RFC Editor publications for OAuth standards", "NIST publications for AI risk-management guidance"],
    correctionsTitle: "Updates and corrections",
    correctionsBody: "Each guide shows its publication and review dates. When a material claim changes, the page content, sources, structured data, and review date should change together. If a public contact surface is available in the live ClawDeals application, it can be used to report a specific page and the evidence that should be reviewed.",
    reviewedLabel: "Editorial policy reviewed 18 July 2026"
  },
  fr: {
    metaTitle: "Normes éditoriales et révision | ClawDeals",
    metaDescription: "Comment l'équipe éditoriale ClawDeals recherche, vérifie, date, source et corrige ses guides marketplace et sécurité des agents.",
    title: "Normes éditoriales et révision",
    eyebrow: "ÉQUIPE ÉDITORIALE CLAWDEALS",
    introduction: "Les guides ClawDeals sont publiés par une équipe éditoriale organisationnelle. Nous n'attribuons pas les articles à des personnes ou compétences inventées. Cette page décrit les preuves de révision attendues.",
    identityTitle: "Qui publie les guides",
    identityBody: "L'équipe éditoriale ClawDeals tient le registre des guides, les traductions, les liens de sources et l'historique des corrections. La signature identifie l'organisation responsable ; elle n'affirme pas qu'un expert externe nommé a vérifié chaque page.",
    methodTitle: "Méthode de révision",
    methodIntro: "Pour les contenus opérationnels, de sécurité et de marketplace, l'équipe applique les contrôles suivants avant de modifier la date de révision publique.",
    methodItems: ["Séparer le comportement du produit des recommandations générales", "Vérifier les affirmations techniques avec des documentations officielles primaires", "Retirer les promesses de délai, prix, performance ou disponibilité non prouvées", "Présenter les exemples comme tels, sans en faire des seuils universels", "Vérifier que le contenu visible, les métadonnées et les données structurées décrivent la même page"],
    sourcesTitle: "Politique de sources",
    sourcesBody: "Les guides lient les documentations primaires au plus près des affirmations concernées. Les contrôles ClawDeals renvoient à des manifestes ou pages produit publics ; les recommandations de protocole et sécurité renvoient aux mainteneurs, organismes de normalisation ou agences publiques.",
    sourcesItems: ["Documentation OpenClaw pour le fonctionnement des Skills et de ClawHub", "Documentation Model Context Protocol pour la sécurité des clients et serveurs MCP", "Publications du RFC Editor pour les standards OAuth", "Publications du NIST pour la gestion des risques liés à l'IA"],
    correctionsTitle: "Mises à jour et corrections",
    correctionsBody: "Chaque guide affiche ses dates de publication et de révision. Lorsqu'une affirmation matérielle change, le contenu, les sources, les données structurées et la date de révision doivent évoluer ensemble. Si l'application ClawDeals affiche un canal de contact public, il peut servir à signaler la page exacte et les preuves à réexaminer.",
    reviewedLabel: "Politique éditoriale révisée le 18 juillet 2026"
  },
  es: {
    metaTitle: "Normas editoriales y revisión | ClawDeals",
    metaDescription: "Cómo el equipo editorial de ClawDeals investiga, revisa, fecha, documenta y corrige sus guías de marketplace y seguridad de agentes.",
    title: "Normas editoriales y revisión",
    eyebrow: "EQUIPO EDITORIAL DE CLAWDEALS",
    introduction: "Las guías de ClawDeals las publica un equipo editorial organizativo. No atribuimos artículos a personas o credenciales inventadas. Esta página explica las pruebas de revisión que pueden esperar los lectores.",
    identityTitle: "Quién publica las guías",
    identityBody: "El equipo editorial de ClawDeals mantiene el registro de guías, las traducciones, los enlaces a fuentes y el historial de correcciones. La firma identifica a la organización responsable; no afirma que un experto externo concreto haya revisado cada página.",
    methodTitle: "Método de revisión",
    methodIntro: "Para contenidos operativos, de seguridad y de marketplace, el equipo aplica las siguientes comprobaciones antes de cambiar la fecha pública de revisión.",
    methodItems: ["Separar el comportamiento del producto de las recomendaciones generales", "Comprobar las afirmaciones técnicas con documentación oficial primaria", "Eliminar promesas no justificadas de tiempo, precio, rendimiento o disponibilidad", "Presentar los ejemplos como ejemplos y no como umbrales universales", "Verificar que el contenido visible, los metadatos y los datos estructurados describen la misma página"],
    sourcesTitle: "Política de fuentes",
    sourcesBody: "Las guías enlazan documentación primaria cerca de las afirmaciones a las que respalda. Los controles de ClawDeals remiten a manifiestos o páginas públicas propias; las recomendaciones de protocolos y seguridad, a sus mantenedores, organismos de normalización o agencias públicas.",
    sourcesItems: ["Documentación de OpenClaw para el funcionamiento de Skills y ClawHub", "Documentación de Model Context Protocol para la seguridad de clientes y servidores MCP", "Publicaciones del RFC Editor para los estándares OAuth", "Publicaciones del NIST para la gestión de riesgos de IA"],
    correctionsTitle: "Actualizaciones y correcciones",
    correctionsBody: "Cada guía muestra sus fechas de publicación y revisión. Cuando cambia una afirmación material, deben actualizarse conjuntamente el contenido, las fuentes, los datos estructurados y la fecha de revisión. Si la aplicación de ClawDeals muestra un canal de contacto público, puede utilizarse para indicar la página concreta y las pruebas que deben revisarse.",
    reviewedLabel: "Política editorial revisada el 18 de julio de 2026"
  }
};

export const getServerSideProps: GetServerSideProps<EditorialPageProps> = async ({ req, res, locale }) => {
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);
  res.setHeader("Cache-Control", isPreviewHost ? "no-store" : "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");
  return {
    props: await withMessages(locale, {
      baseUrl: marketingBaseUrlFromRequest(req),
      isPreviewHost
    })
  };
};

export default function EditorialPage({ baseUrl, isPreviewHost }: EditorialPageProps) {
  const locale = resolveSupportedLocale(useRouter().locale);
  const copy = COPY[locale];
  const urls = buildLocaleUrls(baseUrl, "about/editorial");
  const canonicalUrl = urls[locale];
  const teamId = `${canonicalUrl}#team`;
  const ogLocales = ogLocaleTags(locale);
  const ogImageUrl = `${baseUrl}/og/${locale}.png`;
  const robots = isPreviewHost ? "noindex,follow" : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AboutPage",
        "@id": canonicalUrl,
        url: canonicalUrl,
        name: copy.title,
        description: copy.metaDescription,
        inLanguage: locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-GB",
        dateModified: "2026-07-18",
        about: { "@id": teamId },
        isPartOf: { "@id": `${baseUrl}/#website` }
      },
      {
        "@type": "Organization",
        "@id": teamId,
        name: "ClawDeals Editorial Team",
        alternateName: locale === "fr" ? "Équipe éditoriale ClawDeals" : locale === "es" ? "Equipo editorial de ClawDeals" : undefined,
        url: canonicalUrl,
        parentOrganization: { "@type": "Organization", name: "ClawDeals", url: baseUrl }
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

      <JsonLd id="editorial-json-ld" data={structuredData} />

      <FeaturePageLayout
        title={copy.title}
        subtitle={copy.eyebrow}
        description={copy.introduction}
        icon={<Users size={20} />}
        accentColor="text-secondary"
        accentBg="bg-secondary"
        contentAs="article"
      >
        <section>
          <SectionHeader title={copy.identityTitle} subtitle="ACCOUNTABILITY" accentText="text-secondary" accentBg="bg-secondary" />
          <TechBorder>
            <div className="p-6 md:p-8 text-sm md:text-base text-muted leading-7">{copy.identityBody}</div>
          </TechBorder>
        </section>

        <section>
          <SectionHeader title={copy.methodTitle} subtitle="REVIEW_METHOD" accentText="text-secondary" accentBg="bg-secondary" />
          <p className="text-sm md:text-base text-muted leading-7 max-w-3xl mb-6">{copy.methodIntro}</p>
          <ul className="space-y-3 max-w-3xl">
            {copy.methodItems.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-muted leading-6">
                <CheckCircle2 size={16} className="mt-1 shrink-0 text-success" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionHeader title={copy.sourcesTitle} subtitle="PRIMARY_SOURCES" accentText="text-secondary" accentBg="bg-secondary" />
          <p className="text-sm md:text-base text-muted leading-7 max-w-3xl mb-6">{copy.sourcesBody}</p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {copy.sourcesItems.map((item) => (
              <li key={item} className="border border-border p-5 flex items-start gap-3 text-sm text-muted leading-6">
                <ExternalLink size={15} className="mt-1 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionHeader title={copy.correctionsTitle} subtitle="CHANGE_CONTROL" accentText="text-secondary" accentBg="bg-secondary" />
          <div className="flex items-start gap-4 border border-border bg-surface p-6 md:p-8">
            <RefreshCw size={20} className="mt-1 shrink-0 text-secondary" />
            <div>
              <p className="text-sm md:text-base text-muted leading-7">{copy.correctionsBody}</p>
              <p className="mt-4 font-mono text-xs text-subtle inline-flex items-center gap-2"><BookCheck size={14} />{copy.reviewedLabel}</p>
            </div>
          </div>
        </section>
      </FeaturePageLayout>
    </>
  );
}
