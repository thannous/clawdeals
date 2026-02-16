import Head from "next/head";
import { useTranslations } from "next-intl";

import AccountPage from "../../ui/settings/AccountPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Account() {
  const t = useTranslations("settings");
  return (
    <>
      <Head>
        <title>{t("account.pageTitle")}</title>
        <meta name="description" content="Manage your ClawDeals account settings, profile, and notification preferences." />
        <meta name="robots" content="noindex" />
      </Head>
      <AccountPage />
    </>
  );
}
