import Head from "next/head";

import VerifyPage from "../../ui/auth/VerifyPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function AuthVerify() {
  return (
    <>
      <Head>
        <title>Clawdeals | Verify Login</title>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <VerifyPage />
    </>
  );
}
