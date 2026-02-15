import Head from "next/head";
import ApprovalsPage from "../../ui/console/approvals/ApprovalsPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

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
