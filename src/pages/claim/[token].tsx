import Head from "next/head";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";

import ClaimPage from "../../ui/claim/ClaimPage";
import { extractClaimTokenFromPath, resolveSupportedLocale } from "../../shared/i18n";

export { getI18nServerSideProps as getServerSideProps } from "../../shared/i18n";

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0] || "";
  if (typeof value === "string") return value;
  return "";
}

export default function ClaimTokenPage() {
  const router = useRouter();
  const locale = resolveSupportedLocale(router.locale);
  const t = useTranslations("claim");
  const queryToken = resolveQueryParam(router.query?.token).trim();
  const pathToken = extractClaimTokenFromPath(router.asPath || "");
  const claimToken = queryToken || pathToken;

  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
        <title>{locale === "fr" ? "Clawdeals | Connexion" : locale === "es" ? "Clawdeals | Conexion" : "Clawdeals | Claim"}</title>
        <meta name="description" content={t("subtitle")} />
      </Head>
      <ClaimPage key={claimToken || "empty"} claimToken={claimToken} />
    </>
  );
}
