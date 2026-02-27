import Head from "next/head";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import LegalPageLayout from "../../ui/legal/LegalPageLayout";
import { buildLocalizedLegalContent } from "../../ui/legal/buildLocalizedLegalContent";
import { withMessages } from "../../shared/i18n";
import type { SupportedLocale } from "../../shared/i18n";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags, normalizeMetaDescription } from "../../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../../shared/marketing-request";
import type { GetServerSideProps } from "next";

type PageProps = { baseUrl: string; isPreviewHost: boolean; messages: any };
const LEGAL_I18N_NAMESPACES = ["seo", "landing", "nav", "footer"] as const;

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ req, res, locale }) => {
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);
  res.setHeader(
    "Cache-Control",
    isPreviewHost ? "no-store" : "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400"
  );
  return {
    props: await withMessages(locale, {
      baseUrl: marketingBaseUrlFromRequest(req),
      isPreviewHost
    }, { namespaces: LEGAL_I18N_NAMESPACES })
  };
};

const LAST_UPDATED = "2026-02-15";

const TermsContent = buildLocalizedLegalContent({
  en: () => import("../../ui/legal/terms-content.en").then((module) => ({ default: module.TermsEN })),
  fr: () => import("../../ui/legal/terms-content.fr").then((module) => ({ default: module.TermsFR })),
  es: () => import("../../ui/legal/terms-content.es").then((module) => ({ default: module.TermsES }))
});

export default function TermsOfService({ baseUrl }: PageProps) {
  const router = useRouter();
  const tSeo = useTranslations("seo");
  const detected = router.locale ?? "en";
  const resolvedLocale: SupportedLocale = (detected === "fr" || detected === "es") ? detected : "en";

  const slug = "legal/terms";
  const urls = buildLocaleUrls(baseUrl, slug);
  const canonicalUrl = urls[resolvedLocale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(resolvedLocale);
  const robotsContent = "noindex,follow";

  const title = resolvedLocale === "fr"
    ? "Conditions d'utilisation"
    : resolvedLocale === "es"
      ? "Términos de servicio"
      : "Terms of Service";

  return (
    <>
      <Head>
        <title>{tSeo("legalTerms.title")}</title>
        <meta name="description" content={normalizeMetaDescription(tSeo("legalTerms.description"))} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />
        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}
        <meta property="og:title" content={tSeo("legalTerms.ogTitle")} />
        <meta property="og:description" content={tSeo("legalTerms.ogDescription")} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:locale" content={ogLocales.current} />
        {ogLocales.alternates.map((alt) => (
          <meta key={alt} property="og:locale:alternate" content={alt} />
        ))}
        <meta property="og:site_name" content="ClawDeals" />
      </Head>
      <LegalPageLayout title={title} lastUpdated={LAST_UPDATED}>
        <TermsContent locale={resolvedLocale} />
      </LegalPageLayout>
    </>
  );
}
