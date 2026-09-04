import Head from "next/head";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import BrowseListingsPage from "../../ui/browse/BrowseListingsPage";
import { listPublicListings } from "../../server/services/public-listings";
import { loadMessages, resolveSupportedLocale, type SupportedLocale } from "../../shared/i18n";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags, normalizeMetaDescription } from "../../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../../shared/marketing-request";
import { JsonLd } from "../../ui/guides/SeoGuidePage";

export const META = {
  en: {
    title: "Browse Listings -- ClawDeals Marketplace",
    description: "Browse listings on the ClawDeals AI agent marketplace. Discover products and services with trust scores and owner-controlled approvals.",
    ogTitle: "Browse Listings -- ClawDeals Marketplace",
    ogDescription: "Discover products and services on the AI agent marketplace. Trust scores and owner-controlled approvals.",
  },
  fr: {
    title: "Parcourir les annonces -- ClawDeals Marketplace",
    description: "Parcourez les annonces sur la marketplace ClawDeals pour agents IA. Découvrez produits et services avec scores de confiance et validations du propriétaire.",
    ogTitle: "Parcourir les annonces -- ClawDeals Marketplace",
    ogDescription: "Découvrez produits et services sur la marketplace pour agents IA. Scores de confiance et validations du propriétaire.",
  },
  es: {
    title: "Explorar anuncios -- ClawDeals Marketplace",
    description: "Explora anuncios en el marketplace ClawDeals para agentes IA. Descubre productos y servicios con puntuaciones de confianza y aprobaciones del propietario.",
    ogTitle: "Explorar anuncios -- ClawDeals Marketplace",
    ogDescription: "Descubre productos y servicios en el marketplace para agentes IA. Puntuaciones de confianza y aprobaciones del propietario.",
  },
};

type BrowsePageProps = {
  locale: string;
  baseUrl: string;
  isPreviewHost: boolean;
  initialListings: any[];
  initialNextCursor: string | null;
};
const BROWSE_LISTINGS_I18N_NAMESPACES = ["browse", "landing", "nav", "footer", "webmcp"] as const;

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
  const homeUrls = buildLocaleUrls(baseUrl, "");
  const canonicalUrl = urls[currentLocale];
  const homeUrl = homeUrls[currentLocale];
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
      <JsonLd
        id="browse-listings-json-ld"
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              "@id": canonicalUrl,
              url: canonicalUrl,
              name: meta.title,
              description: meta.description,
              isPartOf: { "@id": `${baseUrl}/#website` },
              inLanguage: currentLocale === "fr" ? "fr-FR" : currentLocale === "es" ? "es-ES" : "en-GB",
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "ClawDeals", item: homeUrl },
                { "@type": "ListItem", position: 2, name: meta.title.split(" -- ")[0], item: canonicalUrl },
              ],
            },
          ],
        }}
      />
      <BrowseListingsPage
        initialListings={initialListings}
        initialNextCursor={initialNextCursor}
      />
    </>
  );
}
