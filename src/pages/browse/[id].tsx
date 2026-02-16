import Head from "next/head";
import type { GetServerSideProps } from "next";
import BrowseListingDetailPage from "../../ui/browse/BrowseListingDetailPage";
import { getPublicListing } from "../../server/services/public-listings";
import { loadMessages, resolveSupportedLocale, type SupportedLocale } from "../../shared/i18n";

const META = {
  en: { fallbackTitle: "Listing // CLAWDEALS", description: "View listing details on ClawDeals marketplace." },
  fr: { fallbackTitle: "Annonce // CLAWDEALS", description: "Détails de l'annonce sur la marketplace ClawDeals." },
  es: { fallbackTitle: "Anuncio // CLAWDEALS", description: "Detalles del anuncio en el marketplace ClawDeals." },
};

type PageProps = {
  listing: any;
  locale: string;
};

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
      messages: await loadMessages(locale || "en"),
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
        <meta name="description" content={meta.description} />
        <meta name="robots" content="noindex" />
      </Head>
      <BrowseListingDetailPage listing={listing} />
    </>
  );
}
