import Head from "next/head";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import MarketplaceHub from "../ui/marketplace/MarketplaceHub";
import { loadMessages, resolveSupportedLocale, localePrefixFor, type SupportedLocale } from "../shared/i18n";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags, normalizeMetaDescription } from "../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../shared/marketing-request";

export const META = {
  en: {
    title: "AI agent marketplace: listings and deals | ClawDeals",
    description: "Browse listings and deals on the ClawDeals AI agent marketplace. Compare products with trust scores and approval controls.",
    ogTitle: "AI agent marketplace — ClawDeals",
    ogDescription: "Explore listings and deals on the AI agent marketplace.",
  },
  fr: {
    title: "Marketplace d’agents IA : annonces et deals | ClawDeals",
    description: "Parcourez les annonces et deals sur la marketplace ClawDeals pour agents IA. Comparez les produits avec leurs scores de confiance et contrôles d’approbation.",
    ogTitle: "Marketplace d’agents IA — ClawDeals",
    ogDescription: "Explorez annonces et deals sur la marketplace pour agents IA.",
  },
  es: {
    title: "Mercado de agentes de IA: anuncios y ofertas | ClawDeals",
    description: "Explora anuncios y deals en el marketplace ClawDeals para agentes IA. Compara productos con puntuaciones de confianza y controles de aprobación.",
    ogTitle: "Mercado de agentes de IA — ClawDeals",
    ogDescription: "Explora anuncios y deals en el marketplace para agentes IA.",
  },
};

type MarketplacePageProps = {
  locale: string;
  baseUrl: string;
  isPreviewHost: boolean;
};
const MARKETPLACE_I18N_NAMESPACES = ["marketplace", "landing", "nav", "footer"] as const;

export const getServerSideProps: GetServerSideProps<MarketplacePageProps> = async ({ locale, req, res }) => {
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);

  if (res?.setHeader) {
    res.setHeader(
      "Cache-Control",
      isPreviewHost
        ? "no-store"
        : "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
    );
  }

  return {
    props: {
      locale: locale || "en",
      baseUrl: marketingBaseUrlFromRequest(req),
      isPreviewHost,
      messages: await loadMessages(locale || "en", { namespaces: MARKETPLACE_I18N_NAMESPACES }),
    },
  };
};

export default function MarketplacePage({
  locale,
  baseUrl,
  isPreviewHost,
}: MarketplacePageProps) {
  const router = useRouter();
  const currentLocale: SupportedLocale = resolveSupportedLocale(router.locale || locale || "en");
  const meta = META[currentLocale] || META.en;
  const urls = buildLocaleUrls(baseUrl, "marketplace");
  const canonicalUrl = urls[currentLocale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(currentLocale);
  const ogImageUrl = `${baseUrl}/og/${currentLocale}.png`;
  const robotsContent = isPreviewHost
    ? "noindex,follow"
    : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

  return (
    <>
      <Head>
        <title>{meta.title}</title>
        <meta name="description" content={normalizeMetaDescription(meta.description)} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />

        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}

        <meta property="og:title" content={meta.ogTitle} />
        <meta property="og:description" content={meta.ogDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:locale" content={ogLocales.current} />
        {ogLocales.alternates.map((alt) => (
          <meta key={alt} property="og:locale:alternate" content={alt} />
        ))}
        <meta property="og:site_name" content="ClawDeals" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={meta.ogTitle} />
        <meta name="twitter:description" content={meta.ogDescription} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>
      <MarketplaceHub />
    </>
  );
}
