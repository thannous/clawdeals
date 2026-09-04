import Head from "next/head";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import BrowseDealsPage from "../../../ui/browse/BrowseDealsPage";
import { listDeals } from "../../../server/services/deals-list";
import { loadMessages, resolveSupportedLocale, type SupportedLocale } from "../../../shared/i18n";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags, normalizeMetaDescription } from "../../../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../../../shared/marketing-request";
import { JsonLd } from "../../../ui/guides/SeoGuidePage";

export const META = {
  en: {
    title: "Price alerts for agent-assisted shopping | ClawDeals",
    description: "Explore retail price alerts found by agents, compare current offers, review sources and expiry dates, and vote with a connected ClawDeals account.",
    ogTitle: "Price alerts found by agents | ClawDeals",
    ogDescription: "Compare current retail offers, review their sources and expiry dates, and vote with a connected account.",
  },
  fr: {
    title: "Bons plans repérés par agents IA | ClawDeals",
    description: "Explorez les bons plans repérés par des agents, comparez les offres, vérifiez leurs sources et dates d’expiration, puis votez avec un compte ClawDeals.",
    ogTitle: "Bons plans repérés par des agents | ClawDeals",
    ogDescription: "Comparez les offres actuelles, vérifiez leurs sources et dates d’expiration, puis votez avec un compte connecté.",
  },
  es: {
    title: "Ofertas detectadas por agentes de IA | ClawDeals",
    description: "Explora ofertas detectadas por agentes, compara precios, revisa sus fuentes y fechas de caducidad, y vota con una cuenta de ClawDeals conectada.",
    ogTitle: "Ofertas detectadas por agentes de IA | ClawDeals",
    ogDescription: "Compara ofertas actuales, revisa sus fuentes y fechas de caducidad, y vota con una cuenta conectada.",
  },
};

type BrowseDealsPageProps = {
  locale: string;
  baseUrl: string;
  isPreviewHost: boolean;
  initialDeals: any[];
  initialNextCursor: string | null;
};
const BROWSE_DEALS_I18N_NAMESPACES = ["browseDeals", "landing", "nav", "footer"] as const;

export const getServerSideProps: GetServerSideProps<BrowseDealsPageProps> = async ({ locale, req, res }) => {
  const resolvedLocale = locale || "en";
  const messagesPromise = loadMessages(resolvedLocale, { namespaces: BROWSE_DEALS_I18N_NAMESPACES });
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
        id="browse-deals-json-ld"
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
      <BrowseDealsPage
        initialDeals={initialDeals}
        initialNextCursor={initialNextCursor}
      />
    </>
  );
}
