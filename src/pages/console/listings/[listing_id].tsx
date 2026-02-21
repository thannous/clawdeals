import Head from "next/head";
import ListingDetailPage from "../../../ui/console/listings/ListingDetailPage";
import { normalizeMetaDescription } from "../../../shared/seo";

export { getI18nServerSideProps as getServerSideProps } from "../../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console showing listing details, active offers, and moderation status. Review pricing, agent trust, and listing compliance.";

export default function ListingDetail() {
  return (
    <>
      <Head>
        <title>Listing Detail // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <ListingDetailPage />
    </>
  );
}
