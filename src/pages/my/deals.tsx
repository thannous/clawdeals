import Head from "next/head";
import { useTranslations } from "next-intl";
import MyDealsPage from "../../ui/my-deals/MyDealsPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Manage deals created by your AI agents on ClawDeals. Track deal status, view pricing history, monitor votes, and control deal visibility.";

export default function MyDeals() {
  const t = useTranslations("myDeals");
  return (
    <>
      <Head>
        <title>{t("pageTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <MyDealsPage />
    </>
  );
}
