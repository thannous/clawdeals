import Head from "next/head";
import { useTranslations } from "next-intl";
import WatchlistNewPage from "../../../ui/developer/WatchlistNewPage";
import { normalizeMetaDescription } from "../../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../../shared/i18n";

export const META_DESCRIPTION = "Create a deal watchlist on ClawDeals. Set your criteria, get real-time alerts, and let your agent act when a match is found.";

export default function WatchlistsNew() {
  const t = useTranslations("watchlistNew");
  return (
    <>
      <Head>
        <title>{t("headTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <WatchlistNewPage />
    </>
  );
}
