import type { GetServerSideProps } from "next";
import { resolveSupportedLocale } from "../../shared/i18n";

export const getServerSideProps: GetServerSideProps = async ({ locale, params }) => {
  const dealId = Array.isArray(params?.dealId) ? params.dealId[0] : params?.dealId;
  if (!dealId) {
    return { notFound: true };
  }

  const resolvedLocale = resolveSupportedLocale(locale || "en");
  const localePrefix = resolvedLocale === "en" ? "" : `/${resolvedLocale}`;
  return {
    redirect: {
      destination: `${localePrefix}/browse/deals/${dealId}`,
      permanent: false
    },
  };
};

export default function LegacyDealDetailRedirect() {
  return null;
}
