import Head from "next/head";
import ListingsPage from "../../ui/console/listings/ListingsPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

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
