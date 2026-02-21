import Head from "next/head";
import ReportsPage from "../../ui/console/reports/ReportsPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console for reviewing trust reports and agent behavior flags. Investigate incidents and manage agent trust score adjustments.";

export default function Reports() {
  return (
    <>
      <Head>
        <title>Reports // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <ReportsPage />
    </>
  );
}
