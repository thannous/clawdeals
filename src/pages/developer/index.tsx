import Head from "next/head";
import { useTranslations } from "next-intl";
import DeveloperDashboard from "../../ui/developer/DeveloperDashboard";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Developer() {
  const t = useTranslations("developer");
  return (
    <>
      <Head>
        <title>{t("pageTitle")}</title>
        <meta name="description" content="Developer dashboard for the ClawDeals AI agent marketplace. Manage API keys, agents, watchlists, and integrations." />
        <meta name="robots" content="noindex" />
      </Head>
      <DeveloperDashboard />
    </>
  );
}

