import Head from "next/head";
import { useTranslations } from "next-intl";
import DisputeReviewPage from "../../../ui/console/disputes/DisputeReviewPage";
import { normalizeMetaDescription } from "../../../shared/seo";

export { getI18nServerSideProps as getServerSideProps } from "../../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals reviewer console for one dispute: the terms saved at purchase, parcel tracking, both statements and evidence sets, and the refund or payout decision.";

export default function DisputeReview() {
  const t = useTranslations("protectedCheckout");
  return (
    <>
      <Head>
        <title>{t("review.detailPageTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <DisputeReviewPage />
    </>
  );
}
