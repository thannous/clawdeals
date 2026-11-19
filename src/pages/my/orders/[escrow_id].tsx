import Head from "next/head";
import { useTranslations } from "next-intl";
import OrderDetailPage from "../../../ui/my-orders/OrderDetailPage";
import { normalizeMetaDescription } from "../../../shared/seo";

export { getI18nServerSideProps as getServerSideProps } from "../../../shared/i18n";

export const META_DESCRIPTION = "One protected ClawDeals order: the terms saved at purchase, parcel tracking, the inspection window, and the dispute with both sides' evidence.";

export default function OrderDetail() {
  const t = useTranslations("protectedCheckout");
  return (
    <>
      <Head>
        <title>{t("detailPageTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <OrderDetailPage />
    </>
  );
}
