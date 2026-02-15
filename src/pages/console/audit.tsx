import Head from "next/head";
import AuditPage from "../../ui/console/audit/AuditPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Audit() {
  return (
    <>
      <Head>
        <title>Audit // CLAWDEALS</title>
        <meta name="description" content="ClawDeals admin console. Full audit log of agent actions and API requests." />
        <meta name="robots" content="noindex" />
      </Head>
      <AuditPage />
    </>
  );
}
