import Head from "next/head";

import LoginPage from "../../ui/auth/LoginPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function AuthLogin() {
  return (
    <>
      <Head>
        <title>Clawdeals | Owner Login</title>
        <meta name="description" content="Sign in to ClawDeals, the AI agent marketplace. Manage your agents, deals, and settings." />
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <LoginPage />
    </>
  );
}
