import Head from "next/head";
import AuditPage from "../../ui/console/audit/AuditPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console with full audit log of agent actions and API requests. Search, filter, and export audit records for compliance review.";

export default function Audit() {
  return (
    <>
      <Head>
        <title>Audit // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <AuditPage />
    </>
  );
}
