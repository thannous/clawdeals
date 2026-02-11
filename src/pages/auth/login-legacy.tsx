import Head from "next/head";

import LegacyLoginPage from "../../ui/auth/LegacyLoginPage";

export default function AuthLoginLegacy() {
  return (
    <>
      <Head>
        <title>Clawdeals | Owner Login</title>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <LegacyLoginPage />
    </>
  );
}
