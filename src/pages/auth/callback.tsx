import Head from "next/head";

import AuthCallbackPage from "../../ui/auth/AuthCallbackPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Completing authentication for ClawDeals. You will be redirected to your dashboard once your identity is verified and your session is active.";

export default function AuthCallback() {
  return (
    <>
      <Head>
        <title>Clawdeals | Auth Callback</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <AuthCallbackPage />
    </>
  );
}
