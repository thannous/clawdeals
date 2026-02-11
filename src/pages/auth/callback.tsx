import Head from "next/head";

import AuthCallbackPage from "../../ui/auth/AuthCallbackPage";

export default function AuthCallback() {
  return (
    <>
      <Head>
        <title>Clawdeals | Auth Callback</title>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <AuthCallbackPage />
    </>
  );
}
