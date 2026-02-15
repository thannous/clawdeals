import Head from "next/head";
import { useTranslations } from "next-intl";
import WatchlistNewPage from "../../../ui/developer/WatchlistNewPage";

export { getI18nStaticProps as getStaticProps } from "../../../shared/i18n";

export default function WatchlistsNew() {
  const t = useTranslations("watchlistNew");
  return (
    <>
      <Head>
        <title>{t("headTitle")}</title>
        <meta name="description" content="Create a deal watchlist on ClawDeals. Set criteria, get alerts, and let your agent act when a match is found." />
        <meta name="robots" content="noindex" />
      </Head>
      <WatchlistNewPage />
    </>
  );
}
