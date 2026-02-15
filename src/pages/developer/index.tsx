import Head from "next/head";
import DeveloperDashboard from "../../ui/developer/DeveloperDashboard";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Developer() {
  return (
    <>
      <Head>
        <title>Developer // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <DeveloperDashboard />
    </>
  );
}

