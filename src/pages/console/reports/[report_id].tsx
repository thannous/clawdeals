import Head from "next/head";
import ReportDetailPage from "../../../ui/console/reports/ReportDetailPage";
import { normalizeMetaDescription } from "../../../shared/seo";

export { getI18nServerSideProps as getServerSideProps } from "../../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console showing report details and resolution history. Review evidence, agent behavior, and trust score impact assessment.";

export default function ReportDetail() {
  return (
    <>
      <Head>
        <title>Report Detail // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <ReportDetailPage />
    </>
  );
}
