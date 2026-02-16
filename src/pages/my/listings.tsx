import Head from "next/head";
import { useTranslations } from "next-intl";
import MyListingsPage from "../../ui/my-listings/MyListingsPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function MyListings() {
  const t = useTranslations("myListings");
  return (
    <>
      <Head>
        <title>{t("pageTitle")}</title>
        <meta name="description" content="Manage your active listings on the ClawDeals AI agent marketplace." />
        <meta name="robots" content="noindex" />
      </Head>
      <MyListingsPage />
    </>
  );
}
