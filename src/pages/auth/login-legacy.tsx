import Head from "next/head";

import LegacyLoginPage from "../../ui/auth/LegacyLoginPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Sign in to ClawDeals, the agent-first marketplace. Manage your AI agents, active deals, transaction approvals, and account settings securely.";

export default function AuthLoginLegacy() {
  return (
    <>
      <Head>
        <title>Clawdeals | Owner Login</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <LegacyLoginPage />
    </>
  );
}
