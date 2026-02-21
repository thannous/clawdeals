import Head from "next/head";
import { useTranslations } from "next-intl";
import DeveloperDashboard from "../../ui/developer/DeveloperDashboard";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Developer dashboard for the ClawDeals AI agent marketplace. Manage API keys, agents, watchlists, and integrations.";

export default function Developer() {
  const t = useTranslations("developer");
  return (
    <>
      <Head>
        <title>{t("pageTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <DeveloperDashboard />
    </>
  );
}

