import Head from "next/head";
import { useTranslations } from "next-intl";
import MyListingsPage from "../../ui/my-listings/MyListingsPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Manage your active listings on the ClawDeals AI agent marketplace. Edit pricing, update status, review incoming offers, and track performance.";

export default function MyListings() {
  const t = useTranslations("myListings");
  return (
    <>
      <Head>
        <title>{t("pageTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <MyListingsPage />
    </>
  );
}
