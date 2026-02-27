import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import Landing from "../ui/Landing";
import { loadMessages } from "../shared/i18n";
import type { SupportedLocale } from "../shared/i18n";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags, normalizeMetaDescription } from "../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../shared/marketing-request";
import packageJson from "../../package.json";
import type { GetServerSideProps } from "next";

type HomePageProps = {
  locale: string;
  baseUrl: string;
  isPreviewHost: boolean;
  buildTimeIso: string;
  appVersion: string;
  deploySha?: string;
  messages: any;
};
const HOME_I18N_NAMESPACES = ["seo", "landing", "nav", "footer"] as const;

export const getServerSideProps: GetServerSideProps<HomePageProps> = async ({ locale, req, res }) => {
  const appVersion =
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.npm_package_version ||
    packageJson?.version ||
    "0.0.1";
  const deployShaRaw =
    process.env.NEXT_PUBLIC_DEPLOY_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_HASH ||
    process.env.GIT_COMMIT_SHA ||
    "";
  const deploySha = typeof deployShaRaw === "string" && deployShaRaw.length >= 7 ? deployShaRaw : undefined;
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);
  if (res?.setHeader) {
    res.setHeader(
      "Cache-Control",
      isPreviewHost
        ? "no-store"
        : "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400"
    );
  }

  return {
    props: {
      locale: locale || "en",
      baseUrl: marketingBaseUrlFromRequest(req),
      isPreviewHost,
      buildTimeIso: new Date().toISOString(),
      appVersion,
      ...(deploySha ? { deploySha } : {}),
      messages: await loadMessages(locale || "en", { namespaces: HOME_I18N_NAMESPACES })
    }
  };
};

export default function Home({
  locale,
  baseUrl,
  isPreviewHost,
  buildTimeIso,
  appVersion,
  deploySha
}: HomePageProps) {
  const router = useRouter();
  const t = useTranslations("seo");
  const tLanding = useTranslations("landing");
  const currentLocale = (router.locale || locale || "en") as SupportedLocale;
  const resolvedLocale: SupportedLocale = (currentLocale === "fr" || currentLocale === "es") ? currentLocale : "en";

  const urls = buildLocaleUrls(baseUrl, "");
  const canonicalUrl = urls[resolvedLocale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(resolvedLocale);
  const ogImageUrl = `${baseUrl}/og/${resolvedLocale === "fr" ? "fr" : "en"}.png`;
  const robotsContent = isPreviewHost
    ? "noindex,follow"
    : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

  const faqItemCount = parseInt(tLanding("faq.itemCount"), 10);
  const faqItems = Array.from({ length: faqItemCount }, (_, i) => ({
    q: tLanding(`faq.item_${i}.q`),
    a: tLanding(`faq.item_${i}.a`)
  }));

  return (
    <>
      <Head>
        <title>{t("home.title")}</title>
        <meta name="description" content={normalizeMetaDescription(t("home.description"))} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />

        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}

        <meta property="og:title" content={t("home.ogTitle")} />
        <meta property="og:description" content={t("home.ogDescription")} />
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
        <meta name="twitter:title" content={t("home.ogTitle")} />
        <meta name="twitter:description" content={t("home.ogDescription")} />
        <meta name="twitter:image" content={ogImageUrl} />

      </Head>
      <Script id="home-json-ld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${baseUrl}/#organization`,
              name: "ClawDeals",
              url: baseUrl,
              logo: `${baseUrl}/favicon.svg`,
              description: t("home.orgDescription"),
              sameAs: [
                "https://github.com/clawdeals"
              ]
            },
            {
              "@type": "WebSite",
              "@id": `${baseUrl}/#website`,
              url: baseUrl,
              name: "ClawDeals",
              publisher: { "@id": `${baseUrl}/#organization` },
              inLanguage: [resolvedLocale === "fr" ? "fr-FR" : resolvedLocale === "es" ? "es-ES" : "en-US"]
            },
            {
              "@type": "WebPage",
              "@id": canonicalUrl,
              url: canonicalUrl,
              name: t("home.title"),
              description: t("home.description"),
              isPartOf: { "@id": `${baseUrl}/#website` },
              inLanguage: resolvedLocale === "fr" ? "fr-FR" : resolvedLocale === "es" ? "es-ES" : "en-US"
            },
            {
              "@type": "SoftwareApplication",
              name: "ClawDeals",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Any",
              description: t("home.appDescription"),
              url: baseUrl,
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD"
              }
            },
            {
              "@type": "FAQPage",
              "@id": `${canonicalUrl}#faq`,
              isPartOf: { "@id": canonicalUrl },
              mainEntity: faqItems.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: item.a
                }
              }))
            }
          ]
        }).replace(/</g, "\\u003c")}
      </Script>
      <Landing
        locale={resolvedLocale}
        buildTimeIso={buildTimeIso}
        appVersion={appVersion}
        deploySha={deploySha}
      />
    </>
  );
}
