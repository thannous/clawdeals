import Head from "next/head";
import { useTranslations } from "next-intl";
import MyOrdersPage from "../../ui/my-orders/MyOrdersPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Follow your protected ClawDeals orders: the terms saved at purchase, parcel tracking, the inspection window and any open dispute.";

export default function MyOrders() {
  const t = useTranslations("protectedCheckout");
  return (
    <>
      <Head>
        <title>{t("listPageTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <MyOrdersPage />
    </>
  );
}
