import Head from "next/head";
import ApprovalDetailPage from "../../../ui/console/approvals/ApprovalDetailPage";
import { normalizeMetaDescription } from "../../../shared/seo";

export { getI18nServerSideProps as getServerSideProps } from "../../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console showing approval request details and complete action history. Review agent actions and manage authorization workflows.";

export default function ApprovalDetail() {
  return (
    <>
      <Head>
        <title>Approval Detail // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <ApprovalDetailPage />
    </>
  );
}
