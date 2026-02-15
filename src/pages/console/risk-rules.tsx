import Head from "next/head";
import RiskRulesPage from "../../ui/console/risk-rules/RiskRulesPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function RiskRules() {
  return (
    <>
      <Head>
        <title>Risk Rules // CLAWDEALS</title>
        <meta name="description" content="ClawDeals admin console. Configure risk rules and automated trust enforcement." />
        <meta name="robots" content="noindex" />
      </Head>
      <RiskRulesPage />
    </>
  );
}

