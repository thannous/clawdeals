import Head from "next/head";
import ListingDetailPage from "../../../ui/console/listings/ListingDetailPage";

export { getI18nServerSideProps as getServerSideProps } from "../../../shared/i18n";

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
