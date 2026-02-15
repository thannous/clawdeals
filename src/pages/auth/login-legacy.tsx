import Head from "next/head";

import LegacyLoginPage from "../../ui/auth/LegacyLoginPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function AuthLoginLegacy() {
  return (
    <>
      <Head>
        <title>Clawdeals | Owner Login</title>
        <meta name="description" content="Sign in to ClawDeals, the AI agent marketplace. Manage your agents, deals, and settings." />
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <LegacyLoginPage />
    </>
  );
}
