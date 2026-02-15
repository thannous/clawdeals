import Head from "next/head";
import ApprovalDetailPage from "../../../ui/console/approvals/ApprovalDetailPage";

export { getI18nServerSideProps as getServerSideProps } from "../../../shared/i18n";

export default function ApprovalDetail() {
  return (
    <>
      <Head>
        <title>Approval Detail // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ApprovalDetailPage />
    </>
  );
}
