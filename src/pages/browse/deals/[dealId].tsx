import Head from "next/head";
import type { GetServerSideProps } from "next";
import BrowseDealDetailPage from "../../../ui/browse/BrowseDealDetailPage";
import { getPublicDeal } from "../../../server/services/public-deals";
import { isUuid } from "../../../server/utils/validators";
import { loadMessages, resolveSupportedLocale, type SupportedLocale } from "../../../shared/i18n";

const META = {
  en: { fallbackTitle: "Deal // CLAWDEALS", description: "View deal details on ClawDeals marketplace." },
  fr: { fallbackTitle: "Deal // CLAWDEALS", description: "Détails du deal sur la marketplace ClawDeals." },
  es: { fallbackTitle: "Deal // CLAWDEALS", description: "Detalles del deal en el marketplace ClawDeals." },
};

type PageProps = {
  deal: any;
  locale: string;
};

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ params, locale, res }) => {
  const dealId = Array.isArray(params?.dealId) ? params.dealId[0] : params?.dealId;
  if (!dealId || !isUuid(dealId)) return { notFound: true };

  let deal = null;
  try {
    deal = await getPublicDeal(dealId);
  } catch {
    // fall through to 404
  }

  if (!deal) return { notFound: true };

  if (res?.setHeader) {
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=120, stale-while-revalidate=300");
  }

  const resolvedLocale = locale || "en";
  return {
    props: {
      deal,
      locale: resolvedLocale,
      messages: await loadMessages(resolvedLocale),
    },
  };
};

export default function BrowseDealDetailRoute({ deal, locale }: PageProps) {
  const currentLocale: SupportedLocale = resolveSupportedLocale(locale);
  const meta = META[currentLocale] || META.en;
  const title = deal?.title ? `${deal.title} // CLAWDEALS` : meta.fallbackTitle;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={meta.description} />
        <meta name="robots" content="noindex" />
      </Head>
      <BrowseDealDetailPage deal={deal} />
    </>
  );
}
