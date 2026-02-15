import Head from "next/head";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import LegalPageLayout from "../../ui/legal/LegalPageLayout";
import { TermsEN, TermsFR, TermsES } from "../../ui/legal/terms-content";
import { withMessages } from "../../shared/i18n";
import type { SupportedLocale } from "../../shared/i18n";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags } from "../../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../../shared/marketing-request";
import type { GetServerSideProps } from "next";

type PageProps = { baseUrl: string; isPreviewHost: boolean; messages: any };

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
    })
  };
};

const LAST_UPDATED = "2026-02-15";

function TermsContent({ locale }: { locale: SupportedLocale }) {
  if (locale === "fr") return <TermsFR />;
  if (locale === "es") return <TermsES />;
  return <TermsEN />;
}

export default function TermsOfService({ baseUrl, isPreviewHost }: PageProps) {
  const router = useRouter();
  const tSeo = useTranslations("seo");
  const detected = router.locale ?? "en";
  const resolvedLocale: SupportedLocale = (detected === "fr" || detected === "es") ? detected : "en";

  const slug = "legal/terms";
  const urls = buildLocaleUrls(baseUrl, slug);
  const canonicalUrl = urls[resolvedLocale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(resolvedLocale);
  const robotsContent = isPreviewHost ? "noindex,follow" : "index,follow";

  const title = resolvedLocale === "fr"
    ? "Conditions d'utilisation"
    : resolvedLocale === "es"
      ? "Términos de servicio"
      : "Terms of Service";

  return (
    <>
      <Head>
        <title>{tSeo("legalTerms.title")}</title>
        <meta name="description" content={tSeo("legalTerms.description")} />
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
