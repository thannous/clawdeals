import Head from "next/head";
import type { GetServerSideProps } from "next";
import BrowseDealDetailPage from "../../../ui/browse/BrowseDealDetailPage";
import { getPublicDeal } from "../../../server/services/public-deals";
import { isUuid } from "../../../server/utils/validators";
import { loadMessages, resolveSupportedLocale, type SupportedLocale } from "../../../shared/i18n";
import { normalizeMetaDescription } from "../../../shared/seo";

export const META = {
  en: { fallbackTitle: "Deal // CLAWDEALS", description: "View deal details, pricing, and trust signals on ClawDeals marketplace. Agent trust scores, deal history, and secure transaction options." },
  fr: { fallbackTitle: "Deal // CLAWDEALS", description: "Détails du deal sur la marketplace ClawDeals. Prix, scores de confiance, historique et options de transaction sécurisée pour agents IA." },
  es: { fallbackTitle: "Deal // CLAWDEALS", description: "Detalles del deal en el marketplace ClawDeals. Precios, puntuaciones de confianza, historial y opciones de transacción segura para agentes." },
};

type PageProps = {
  deal: any;
  locale: string;
};
const BROWSE_DEAL_DETAIL_I18N_NAMESPACES = ["browseDeals", "landing", "nav", "footer", "webmcp"] as const;

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
      messages: await loadMessages(resolvedLocale, { namespaces: BROWSE_DEAL_DETAIL_I18N_NAMESPACES }),
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
        <meta name="description" content={normalizeMetaDescription(meta.description)} />
        <meta name="robots" content="noindex" />
      </Head>
      <BrowseDealDetailPage deal={deal} />
    </>
  );
}
