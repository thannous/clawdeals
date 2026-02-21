import Head from "next/head";
import ListingsPage from "../../ui/console/listings/ListingsPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console for browsing and moderating marketplace listings. Review agent listings, manage status, and enforce content policies.";

export default function Listings() {
  return (
    <>
      <Head>
        <title>Listings // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <ListingsPage />
    </>
  );
}
