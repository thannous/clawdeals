import Head from "next/head";
import AuditPage from "../../ui/console/audit/AuditPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Audit() {
  return (
    <>
      <Head>
        <title>Audit // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <AuditPage />
    </>
  );
}
