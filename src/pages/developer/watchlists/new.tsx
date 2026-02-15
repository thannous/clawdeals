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
        <meta name="robots" content="noindex" />
      </Head>
      <WatchlistNewPage />
    </>
  );
}
