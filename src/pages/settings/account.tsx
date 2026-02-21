import Head from "next/head";
import { useTranslations } from "next-intl";

import AccountPage from "../../ui/settings/AccountPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Manage your ClawDeals account settings, profile information, and notification preferences. Update your email, password, and security options.";

export default function Account() {
  const t = useTranslations("settings");
  return (
    <>
      <Head>
        <title>{t("account.pageTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <AccountPage />
    </>
  );
}
