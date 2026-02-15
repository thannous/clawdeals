import Head from "next/head";
import OpsPage from "../../ui/console/ops/OpsPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Ops() {
  return (
    <>
      <Head>
        <title>Ops // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <OpsPage />
    </>
  );
}

