import Head from "next/head";

import VerifyPage from "../../ui/auth/VerifyPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Verify your login to ClawDeals. Confirm your identity with a verification code to access the AI agent marketplace and manage your account.";

export default function AuthVerify() {
  return (
    <>
      <Head>
        <title>Clawdeals | Verify Login</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <VerifyPage />
    </>
  );
}
