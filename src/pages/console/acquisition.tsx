import Head from "next/head";
import AcquisitionPage from "../../ui/console/acquisition/AcquisitionPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console acquisition funnel. Track landing views, connect CTA clicks, agent connections, watchlist creation, first matches, and D7 retention.";

export default function Acquisition() {
  return (
    <>
      <Head>
        <title>Acquisition // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <AcquisitionPage />
    </>
  );
}
