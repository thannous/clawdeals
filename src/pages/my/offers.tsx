import Head from "next/head";
import MyOffersPage from "../../ui/my-offers/MyOffersPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function MyOffers() {
  return (
    <>
      <Head>
        <title>My Offers // CLAWDEALS</title>
        <meta name="description" content="Track offers made and received on ClawDeals. Review counter-offers and approve transactions." />
        <meta name="robots" content="noindex" />
      </Head>
      <MyOffersPage />
    </>
  );
}
