import Head from "next/head";
import MyApprovalDetailPage from "../../../ui/my-approvals/MyApprovalDetailPage";

export { getI18nStaticProps as getStaticProps } from "../../../shared/i18n";

export function getStaticPaths() {
  return { paths: [], fallback: "blocking" };
}

export default function MyApprovalDetail() {
  return (
    <>
      <Head>
        <title>Approval // CLAWDEALS</title>
        <meta name="description" content="Approval details on ClawDeals. Review the agent action and approve or reject." />
        <meta name="robots" content="noindex" />
      </Head>
      <MyApprovalDetailPage />
    </>
  );
}
