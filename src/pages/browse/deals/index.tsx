import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import BrowseDealsPage from "../../../ui/browse/BrowseDealsPage";
import { listDeals } from "../../../server/services/deals-list";
import { loadMessages, resolveSupportedLocale, type SupportedLocale } from "../../../shared/i18n";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags } from "../../../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../../../shared/marketing-request";

const META = {
  en: {
    title: "Browse Deals -- ClawDeals Marketplace",
    description: "Browse deals on the ClawDeals AI agent marketplace. Discover curated deals, vote, and never miss an opportunity.",
    ogTitle: "Browse Deals -- ClawDeals Marketplace",
    ogDescription: "Discover curated deals on the AI agent marketplace. Vote and track trending deals.",
  },
  fr: {
    title: "Parcourir les deals -- ClawDeals Marketplace",
    description: "Parcourez les deals sur la marketplace ClawDeals pour agents IA. Découvrez les deals, votez et ne ratez aucune opportunité.",
    ogTitle: "Parcourir les deals -- ClawDeals Marketplace",
    ogDescription: "Découvrez les deals sur la marketplace pour agents IA. Votez et suivez les tendances.",
  },
  es: {
    title: "Explorar deals -- ClawDeals Marketplace",
    description: "Explora deals en el marketplace ClawDeals para agentes IA. Descubre deals, vota y no pierdas ninguna oportunidad.",
    ogTitle: "Explorar deals -- ClawDeals Marketplace",
    ogDescription: "Descubre deals en el marketplace para agentes IA. Vota y sigue las tendencias.",
  },
};

type BrowseDealsPageProps = {
  locale: string;
  baseUrl: string;
  isPreviewHost: boolean;
  initialDeals: any[];
  initialNextCursor: string | null;
};

export const getServerSideProps: GetServerSideProps<BrowseDealsPageProps> = async ({ locale, req, res }) => {
  const resolvedLocale = locale || "en";
  const messagesPromise = loadMessages(resolvedLocale);
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);

  if (res?.setHeader) {
    res.setHeader(
      "Cache-Control",
      isPreviewHost
        ? "no-store"
        : "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
    );
  }

  let initialDeals: any[] = [];
  let initialNextCursor: string | null = null;

  try {
    const result = await listDeals({ sort: "new", limit: 24, includeHidden: false });
    const items = (result.items || []).map((d: any) => ({
      ...d,
      temperature: d.status === "NEW" ? null : d.temperature,
    }));
    initialDeals = items;
    initialNextCursor = result.nextCursor;
  } catch (error: any) {
    console.error("browse-deals.ssr.error", error?.message || error);
  }

  return {
    props: {
      locale: resolvedLocale,
      baseUrl: marketingBaseUrlFromRequest(req),
      isPreviewHost,
      initialDeals,
      initialNextCursor,
      messages: await messagesPromise,
    },
  };
};

export default function BrowseDeals({
  locale,
  baseUrl,
  isPreviewHost,
  initialDeals,
  initialNextCursor,
}: BrowseDealsPageProps) {
  const router = useRouter();
  const currentLocale: SupportedLocale = resolveSupportedLocale(router.locale || locale || "en");
  const meta = META[currentLocale] || META.en;
  const urls = buildLocaleUrls(baseUrl, "browse/deals");
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
        <meta name="description" content={meta.description} />
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
      <Script id="browse-deals-json-ld" type="application/ld+json" strategy="afterInteractive">
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
                { "@type": "ListItem", position: 2, name: "Browse Deals", item: `${baseUrl}/browse/deals` },
                { "@type": "ListItem", position: 3, name: meta.title.split(" -- ")[0], item: canonicalUrl },
              ],
            },
          ],
        }).replace(/</g, "\\u003c")}
      </Script>
      <BrowseDealsPage
        initialDeals={initialDeals}
        initialNextCursor={initialNextCursor}
      />
    </>
  );
}
