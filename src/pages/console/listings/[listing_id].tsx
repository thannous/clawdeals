import Head from "next/head";
import ListingDetailPage from "../../../ui/console/listings/ListingDetailPage";

export default function ListingDetail() {
  return (
    <>
      <Head>
        <title>Listing Detail // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ListingDetailPage />
    </>
  );
}
