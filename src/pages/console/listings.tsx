import Head from "next/head";
import ListingsPage from "../../ui/console/listings/ListingsPage";

export default function Listings() {
  return (
    <>
      <Head>
        <title>Listings // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ListingsPage />
    </>
  );
}
