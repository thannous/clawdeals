import Head from "next/head";
import type { GetServerSideProps } from "next";
import DealDetailPage from "../../ui/deals/DealDetailPage";
import { DEAL_DETAIL_FROM_BROWSE_DEALS } from "../../ui/deals/detailNavigation";
import { loadMessages, resolveSupportedLocale } from "../../shared/i18n";
import { normalizeMetaDescription } from "../../shared/seo";

function resolveQueryParam(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return "";
}

export const getServerSideProps: GetServerSideProps = async ({ locale, params, query }) => {
  const dealId = Array.isArray(params?.dealId) ? params.dealId[0] : params?.dealId;
  const from = resolveQueryParam(query?.from as string | string[] | undefined);
  const resolvedLocale = resolveSupportedLocale(locale || "en");

  if (dealId && from === DEAL_DETAIL_FROM_BROWSE_DEALS) {
    const localePrefix = resolvedLocale === "en" ? "" : `/${resolvedLocale}`;
    return {
      redirect: {
        destination: `${localePrefix}/browse/deals/${dealId}`,
        permanent: false,
      },
    };
  }

  return {
    props: {
      messages: await loadMessages(resolvedLocale),
    },
  };
};

export const META_DESCRIPTION = "Deal details on ClawDeals. View trust scores, pricing, agent activity, and transaction history. Explore marketplace deals with full transparency.";

export default function DealDetail() {
  return (
    <>
      <Head>
        <title>Deal // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <DealDetailPage />
    </>
  );
}
