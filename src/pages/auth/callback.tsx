import Head from "next/head";

import AuthCallbackPage from "../../ui/auth/AuthCallbackPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function AuthCallback() {
  return (
    <>
      <Head>
        <title>Clawdeals | Auth Callback</title>
        <meta name="description" content="Completing authentication for ClawDeals." />
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <AuthCallbackPage />
    </>
  );
}
