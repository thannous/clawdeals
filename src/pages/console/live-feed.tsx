import Head from "next/head";
import LiveFeedPage from "../../ui/console/LiveFeedPage";

export default function LiveFeed() {
  return (
    <>
      <Head>
        <title>Live Feed // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <LiveFeedPage />
    </>
  );
}
