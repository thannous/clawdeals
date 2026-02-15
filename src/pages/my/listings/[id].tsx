import Head from "next/head";
import MyListingDetailPage from "../../../ui/my-listings/MyListingDetailPage";

export { getI18nStaticProps as getStaticProps } from "../../../shared/i18n";

export function getStaticPaths() {
  return { paths: [], fallback: "blocking" };
}

export default function MyListingDetail() {
  return (
    <>
      <Head>
        <title>Listing // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <MyListingDetailPage />
    </>
  );
}
