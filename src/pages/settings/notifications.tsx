import Head from "next/head";
import { useTranslations } from "next-intl";

import NotificationsPage from "../../ui/settings/NotificationsPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Choose when ClawDeals sends alerts, which events matter to you, and your local quiet hours.";

export default function Notifications() {
  const t = useTranslations("settings.notifications");
  return (
    <>
      <Head>
        <title>{t("pageTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <NotificationsPage />
    </>
  );
}
