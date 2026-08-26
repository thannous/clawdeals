import Head from "next/head";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";

import WebMcpDemoPage from "../ui/webmcp/WebMcpDemoPage";
import { listPublicListings } from "../server/services/public-listings";
import { loadMessages, resolveSupportedLocale, type SupportedLocale } from "../shared/i18n";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags, normalizeMetaDescription } from "../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../shared/marketing-request";

export const META = {
  en: {
    title: "Clawdeals Copilot -- WebMCP human + agent marketplace",
    description:
      "Clawdeals Copilot exposes marketplace tools through WebMCP so a human and an AI agent share the same live listings grid, with confirmation on every write.",
    ogTitle: "Clawdeals Copilot -- WebMCP marketplace",
    ogDescription: "Search, highlight, and draft listings with WebMCP while the human stays in the loop."
  },
  fr: {
    title: "Clawdeals Copilot -- marketplace WebMCP humain + agent",
    description:
      "Clawdeals Copilot: tools WebMCP pour qu’humain et agent partagent la même grille d’annonces, avec confirmation sur chaque écriture.",
    ogTitle: "Clawdeals Copilot -- marketplace WebMCP",
    ogDescription: "Recherchez, mettez en avant et préparez des annonces via WebMCP, sous contrôle humain."
  },
  es: {
    title: "Clawdeals Copilot -- marketplace WebMCP humano + agente",
    description:
      "Clawdeals Copilot: tools WebMCP para que humano y agente compartan la misma parrilla de anuncios, con confirmación en cada escritura.",
    ogTitle: "Clawdeals Copilot -- marketplace WebMCP",
    ogDescription: "Busca, destaca y prepara anuncios con WebMCP mientras el humano permanece en el bucle."
  }
};

export const META_DESCRIPTION = META.en.description;

type WebmcpPageProps = {
  locale: string;
  baseUrl: string;
  isPreviewHost: boolean;
  initialListings: any[];
  initialNextCursor: string | null;
};

const WEBMCP_I18N_NAMESPACES = ["webmcp", "browse", "landing", "nav", "footer"] as const;

export const getServerSideProps: GetServerSideProps<WebmcpPageProps> = async ({ locale, req, res }) => {
  const resolvedLocale = locale || "en";
  const messagesPromise = loadMessages(resolvedLocale, { namespaces: WEBMCP_I18N_NAMESPACES });
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);

  if (res?.setHeader) {
    res.setHeader(
      "Cache-Control",
      isPreviewHost ? "no-store" : "public, max-age=0, s-maxage=60, stale-while-revalidate=120"
    );
  }

  let initialListings: any[] = [];
  let initialNextCursor: string | null = null;
  try {
    const result = await listPublicListings({ sort: "recent", limit: 24 });
    initialListings = result.items || [];
    initialNextCursor = result.nextCursor;
  } catch (error: any) {
    console.error("webmcp.ssr.error", error?.message || error);
  }

  return {
    props: {
      locale: resolvedLocale,
      baseUrl: marketingBaseUrlFromRequest(req),
      isPreviewHost,
      initialListings,
      initialNextCursor,
      messages: await messagesPromise
    }
  };
};

export default function WebmcpPage({
  locale,
  baseUrl,
  isPreviewHost,
  initialListings,
  initialNextCursor
}: WebmcpPageProps) {
  const router = useRouter();
  const currentLocale: SupportedLocale = resolveSupportedLocale(router.locale || locale || "en");
  const meta = META[currentLocale] || META.en;
  const urls = buildLocaleUrls(baseUrl, "webmcp");
  const canonicalUrl = urls[currentLocale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(currentLocale);
  const robotsContent = isPreviewHost ? "noindex,follow" : "index,follow";

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
        <meta property="og:locale" content={ogLocales.current} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={meta.ogTitle} />
        <meta name="twitter:description" content={meta.ogDescription} />
      </Head>
      <WebMcpDemoPage initialListings={initialListings} initialNextCursor={initialNextCursor} />
    </>
  );
}
