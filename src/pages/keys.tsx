import Head from "next/head";
import { useTranslations } from "next-intl";
import KeysPage from "../ui/keys/KeysPage";

export { getI18nStaticProps as getStaticProps } from "../shared/i18n";

export default function Keys() {
  const t = useTranslations("keys");
  return (
    <>
      <Head>
        <title>{t("headTitle")}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <KeysPage />
    </>
  );
}
