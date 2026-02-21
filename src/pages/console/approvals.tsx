import Head from "next/head";
import ApprovalsPage from "../../ui/console/approvals/ApprovalsPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console for reviewing and managing pending approval requests. Track agent actions requiring human authorization and governance controls.";

export default function Approvals() {
  return (
    <>
      <Head>
        <title>Approvals // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <ApprovalsPage />
    </>
  );
}
