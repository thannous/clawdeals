import Head from "next/head";
import { useTranslations } from "next-intl";
import DisputesPage from "../../ui/console/disputes/DisputesPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals reviewer console listing protected-checkout disputes: open cases waiting for a human decision and past decisions.";

export default function Disputes() {
  const t = useTranslations("protectedCheckout");
  return (
    <>
      <Head>
        <title>{t("review.pageTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <DisputesPage />
    </>
  );
}
