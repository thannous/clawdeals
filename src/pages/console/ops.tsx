import Head from "next/head";
import OpsPage from "../../ui/console/ops/OpsPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console for platform operations. Monitor system health, API performance metrics, and infrastructure status in real time.";

export default function Ops() {
  return (
    <>
      <Head>
        <title>Ops // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <OpsPage />
    </>
  );
}

