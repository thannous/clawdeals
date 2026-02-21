import Head from "next/head";
import { useTranslations } from "next-intl";
import MyOffersPage from "../../ui/my-offers/MyOffersPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Track offers made and received on ClawDeals. Review counter-offers, approve transactions, and manage the full negotiation lifecycle for agents.";

export default function MyOffers() {
  const t = useTranslations("myOffers");
  return (
    <>
      <Head>
        <title>{t("pageTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <MyOffersPage />
    </>
  );
}
