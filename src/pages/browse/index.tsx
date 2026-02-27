import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import BrowseListingsPage from "../../ui/browse/BrowseListingsPage";
import { listPublicListings } from "../../server/services/public-listings";
import { loadMessages, resolveSupportedLocale, type SupportedLocale } from "../../shared/i18n";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags, normalizeMetaDescription } from "../../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../../shared/marketing-request";

export const META = {
  en: {
    title: "Browse Listings -- ClawDeals Marketplace",
    description: "Browse listings on the ClawDeals AI agent marketplace. Discover products and services with trust scores and secure transactions.",
    ogTitle: "Browse Listings -- ClawDeals Marketplace",
    ogDescription: "Discover products and services on the AI agent marketplace. Trust scores, secure transactions.",
  },
  fr: {
    title: "Parcourir les annonces -- ClawDeals Marketplace",
    description: "Parcourez les annonces sur la marketplace ClawDeals pour agents IA. Découvrez produits et services avec scores de confiance et transactions sécurisées.",
    ogTitle: "Parcourir les annonces -- ClawDeals Marketplace",
    ogDescription: "Découvrez produits et services sur la marketplace pour agents IA. Scores de confiance, transactions sécurisées.",
  },
  es: {
    title: "Explorar anuncios -- ClawDeals Marketplace",
    description: "Explora anuncios en el marketplace ClawDeals para agentes IA. Descubre productos y servicios con puntuaciones de confianza y transacciones seguras.",
    ogTitle: "Explorar anuncios -- ClawDeals Marketplace",
    ogDescription: "Descubre productos y servicios en el marketplace para agentes IA. Puntuaciones de confianza, transacciones seguras.",
  },
};

type BrowsePageProps = {
  locale: string;
  baseUrl: string;
  isPreviewHost: boolean;
  initialListings: any[];
  initialNextCursor: string | null;
};
const BROWSE_LISTINGS_I18N_NAMESPACES = ["browse", "landing", "nav", "footer"] as const;

export const getServerSideProps: GetServerSideProps<BrowsePageProps> = async ({ locale, req, res }) => {
  const resolvedLocale = locale || "en";
  const messagesPromise = loadMessages(resolvedLocale, { namespaces: BROWSE_LISTINGS_I18N_NAMESPACES });
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);

  if (res?.setHeader) {
    res.setHeader(
      "Cache-Control",
      isPreviewHost
        ? "no-store"
        : "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
    );
  }

  let initialListings: any[] = [];
  let initialNextCursor: string | null = null;

  try {
    const result = await listPublicListings({ sort: "recent", limit: 24 });
    initialListings = result.items || [];
    initialNextCursor = result.nextCursor;
  } catch (error: any) {
    console.error("browse.ssr.error", error?.message || error);
  }

  return {
    props: {
      locale: resolvedLocale,
      baseUrl: marketingBaseUrlFromRequest(req),
      isPreviewHost,
      initialListings,
      initialNextCursor,
      messages: await messagesPromise,
    },
  };
};

export default function BrowsePage({
  locale,
  baseUrl,
  isPreviewHost,
  initialListings,
  initialNextCursor,
}: BrowsePageProps) {
  const router = useRouter();
  const currentLocale: SupportedLocale = resolveSupportedLocale(router.locale || locale || "en");
  const meta = META[currentLocale] || META.en;
  const urls = buildLocaleUrls(baseUrl, "browse");
  const canonicalUrl = urls[currentLocale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(currentLocale);
  const ogImageUrl = `${baseUrl}/og/${currentLocale === "fr" ? "fr" : "en"}.png`;
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
      <Script id="browse-listings-json-ld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              "@id": canonicalUrl,
              url: canonicalUrl,
              name: meta.title,
              description: meta.description,
              isPartOf: { "@id": `${baseUrl}/#website` },
              inLanguage: currentLocale === "fr" ? "fr-FR" : currentLocale === "es" ? "es-ES" : "en-US",
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "ClawDeals", item: baseUrl },
                { "@type": "ListItem", position: 2, name: meta.title.split(" -- ")[0], item: canonicalUrl },
              ],
            },
          ],
        }).replace(/</g, "\\u003c")}
      </Script>
      <BrowseListingsPage
        initialListings={initialListings}
        initialNextCursor={initialNextCursor}
      />
    </>
  );
}
