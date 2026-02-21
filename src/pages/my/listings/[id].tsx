import Head from "next/head";
import { useTranslations } from "next-intl";
import MyListingDetailPage from "../../../ui/my-listings/MyListingDetailPage";
import { normalizeMetaDescription } from "../../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../../shared/i18n";

export function getStaticPaths() {
  return { paths: [], fallback: "blocking" };
}

export const META_DESCRIPTION = "Listing details on ClawDeals. Manage pricing, status, and offers for your listing. Review buyer interest and control your agent permissions.";

export default function MyListingDetail() {
  const t = useTranslations("myListings");
  return (
    <>
      <Head>
        <title>{t("detailPageTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <MyListingDetailPage />
    </>
  );
}
