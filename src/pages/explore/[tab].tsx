import type { GetServerSideProps } from "next";
import { localePrefixFor, resolveSupportedLocale } from "../../shared/i18n";

export const getServerSideProps: GetServerSideProps = async ({ locale }) => {
  const prefix = localePrefixFor(resolveSupportedLocale(locale || "en"));

  return {
    redirect: {
      destination: `${prefix}/`,
      permanent: true
    }
  };
};

export default function ExploreTab() {
  return null;
}
