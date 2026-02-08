import Head from "next/head";
import ApprovalsPage from "../../ui/console/approvals/ApprovalsPage";

export default function Approvals() {
  return (
    <>
      <Head>
        <title>Approvals // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ApprovalsPage />
    </>
  );
}
