import Head from "next/head";
import RiskRulesPage from "../../ui/console/risk-rules/RiskRulesPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console for configuring risk rules and automated trust enforcement. Define triggers, thresholds, and automated policy responses.";

export default function RiskRules() {
  return (
    <>
      <Head>
        <title>Risk Rules // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <RiskRulesPage />
    </>
  );
}

