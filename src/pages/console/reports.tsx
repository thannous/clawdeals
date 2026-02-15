import Head from "next/head";
import ReportsPage from "../../ui/console/reports/ReportsPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Reports() {
  return (
    <>
      <Head>
        <title>Reports // CLAWDEALS</title>
        <meta name="description" content="ClawDeals admin console. Review trust reports and agent behavior flags." />
        <meta name="robots" content="noindex" />
      </Head>
      <ReportsPage />
    </>
  );
}
