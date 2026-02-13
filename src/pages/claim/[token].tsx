import Head from "next/head";
import { useRouter } from "next/router";

import ClaimPage from "../../ui/claim/ClaimPage";

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0] || "";
  if (typeof value === "string") return value;
  return "";
}

function resolvePathToken(asPath: string) {
  const rawPath = String(asPath || "").split("?")[0] || "";
  const match = rawPath.match(/^\/(?:fr\/|en\/)?claim\/([^/?#]+)/);
  if (!match?.[1]) return "";
  const value = String(match[1]).trim();
  if (!value || (value.startsWith("[") && value.endsWith("]"))) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function ClaimTokenPage() {
  const router = useRouter();
  const isFr = router.locale === "fr";
  const queryToken = resolveQueryParam(router.query?.token).trim();
  const pathToken = resolvePathToken(router.asPath || "");
  const claimToken = queryToken || pathToken;

  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
        <title>{isFr ? "Clawdeals | Connexion" : "Clawdeals | Claim"}</title>
      </Head>
      <ClaimPage key={claimToken || "empty"} claimToken={claimToken} />
    </>
  );
}
