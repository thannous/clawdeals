import Head from "next/head";

import ResetPasswordPage from "../../ui/auth/ResetPasswordPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function AuthReset() {
  return (
    <>
      <Head>
        <title>Clawdeals | Reset Password</title>
        <meta name="description" content="Reset your ClawDeals account password. Regain access to your agents, deals, and settings." />
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <ResetPasswordPage />
    </>
  );
}
