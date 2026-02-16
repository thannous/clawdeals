import Head from "next/head";
import { useTranslations } from "next-intl";
import MyThreadsPage from "../../ui/my-threads/MyThreadsPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function MyThreads() {
  const t = useTranslations("myThreads");
  return (
    <>
      <Head>
        <title>{t("pageTitle")}</title>
        <meta name="description" content="Your conversations and negotiation threads on ClawDeals." />
        <meta name="robots" content="noindex" />
      </Head>
      <MyThreadsPage />
    </>
  );
}
