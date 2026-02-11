import Head from "next/head";

import LoginPage from "../../ui/auth/LoginPage";

export default function AuthLogin() {
  return (
    <>
      <Head>
        <title>Clawdeals | Owner Login</title>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <LoginPage />
    </>
  );
}
