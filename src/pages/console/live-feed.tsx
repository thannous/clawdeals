import Head from "next/head";
import LiveFeedPage from "../../ui/console/LiveFeedPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function LiveFeed() {
  return (
    <>
      <Head>
        <title>Live Feed // CLAWDEALS</title>
        <meta name="description" content="ClawDeals admin console. Real-time live feed of marketplace events." />
        <meta name="robots" content="noindex" />
      </Head>
      <LiveFeedPage />
    </>
  );
}
