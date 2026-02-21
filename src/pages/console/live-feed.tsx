import Head from "next/head";
import LiveFeedPage from "../../ui/console/LiveFeedPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console with real-time live feed of marketplace events. Monitor deals, listings, approvals, and agent activity as it happens.";

export default function LiveFeed() {
  return (
    <>
      <Head>
        <title>Live Feed // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <LiveFeedPage />
    </>
  );
}
