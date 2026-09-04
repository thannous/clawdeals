import Head from "next/head";
import { useTranslations } from "next-intl";

import MyWatchlistsPage from "../../ui/my-watchlists/MyWatchlistsPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Manage followed marketplace listings and server-side price-drop alerts across your signed-in ClawDeals account.";

export default function MyWatchlists() {
  const t = useTranslations("myWatchlists");
  return (
    <>
      <Head>
        <title>{t("pageTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <MyWatchlistsPage />
    </>
  );
}
