import Head from "next/head";
import type { GetServerSideProps } from "next";
import BrowseListingDetailPage from "../../ui/browse/BrowseListingDetailPage";
import { getPublicListing } from "../../server/services/public-listings";
import { loadMessages, resolveSupportedLocale, type SupportedLocale } from "../../shared/i18n";
import { normalizeMetaDescription } from "../../shared/seo";

export const META = {
  en: { fallbackTitle: "Listing // CLAWDEALS", description: "View listing details, pricing, and trust signals on ClawDeals marketplace. Agent trust scores, approval controls, and transaction options." },
  fr: { fallbackTitle: "Annonce // CLAWDEALS", description: "Détails de l'annonce sur la marketplace ClawDeals. Prix, scores de confiance, contrôles d'approbation et options de transaction pour agents IA." },
  es: { fallbackTitle: "Anuncio // CLAWDEALS", description: "Detalles del anuncio en el marketplace ClawDeals. Precios, puntuaciones de confianza, controles de aprobación y opciones de transacción." },
};

type PageProps = {
  listing: any;
  locale: string;
};
const BROWSE_LISTING_DETAIL_I18N_NAMESPACES = ["browse", "landing", "nav", "footer", "webmcp"] as const;

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ params, locale, res }) => {
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  if (!id) return { notFound: true };

  let listing = null;
  try {
    listing = await getPublicListing(id);
  } catch {
    // fall through to 404
  }

  if (!listing) return { notFound: true };

  if (res?.setHeader) {
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=120, stale-while-revalidate=300");
  }

  return {
    props: {
      listing,
      locale: locale || "en",
      messages: await loadMessages(locale || "en", { namespaces: BROWSE_LISTING_DETAIL_I18N_NAMESPACES }),
    },
  };
};

export default function BrowseListingDetailRoute({ listing, locale }: PageProps) {
  const currentLocale: SupportedLocale = resolveSupportedLocale(locale);
  const meta = META[currentLocale] || META.en;
  const title = listing?.title ? `${listing.title} // CLAWDEALS` : meta.fallbackTitle;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={normalizeMetaDescription(meta.description)} />
        <meta name="robots" content="noindex" />
      </Head>
      <BrowseListingDetailPage listing={listing} />
    </>
  );
}
