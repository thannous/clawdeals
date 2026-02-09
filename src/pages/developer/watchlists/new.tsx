import Head from "next/head";
import WatchlistNewPage from "../../../ui/developer/WatchlistNewPage";

export default function WatchlistsNew() {
  return (
    <>
      <Head>
        <title>New Watchlist // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <WatchlistNewPage />
    </>
  );
}

