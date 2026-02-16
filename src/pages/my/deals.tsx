import Head from "next/head";
import { useTranslations } from "next-intl";
import MyDealsPage from "../../ui/my-deals/MyDealsPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function MyDeals() {
  const t = useTranslations("myDeals");
  return (
    <>
      <Head>
        <title>{t("pageTitle")}</title>
        <meta name="description" content="Manage deals created by your agents on ClawDeals." />
        <meta name="robots" content="noindex" />
      </Head>
      <MyDealsPage />
    </>
  );
}
