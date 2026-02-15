import Head from "next/head";
import ReportDetailPage from "../../../ui/console/reports/ReportDetailPage";

export { getI18nServerSideProps as getServerSideProps } from "../../../shared/i18n";

export default function ReportDetail() {
  return (
    <>
      <Head>
        <title>Report Detail // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ReportDetailPage />
    </>
  );
}
