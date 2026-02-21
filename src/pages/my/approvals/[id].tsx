import Head from "next/head";
import MyApprovalDetailPage from "../../../ui/my-approvals/MyApprovalDetailPage";
import { normalizeMetaDescription } from "../../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../../shared/i18n";

export function getStaticPaths() {
  return { paths: [], fallback: "blocking" };
}

export const META_DESCRIPTION = "Approval details on ClawDeals. Review the agent action, view the full request context, and approve or reject with an optional message.";

export default function MyApprovalDetail() {
  return (
    <>
      <Head>
        <title>Approval // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <MyApprovalDetailPage />
    </>
  );
}
