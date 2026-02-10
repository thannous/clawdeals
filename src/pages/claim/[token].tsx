import Head from "next/head";
import { useRouter } from "next/router";

import ClaimPage from "../../ui/claim/ClaimPage";

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0] || "";
  if (typeof value === "string") return value;
  return "";
}

export default function ClaimTokenPage() {
  const router = useRouter();
  const claimToken = resolveQueryParam(router.query?.token).trim();

  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
        <title>Clawdeals | Claim</title>
      </Head>
      <ClaimPage key={claimToken || "empty"} claimToken={claimToken} />
    </>
  );
}
