import Head from "next/head";

import ResetPasswordPage from "../../ui/auth/ResetPasswordPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Reset your ClawDeals account password. Regain secure access to your AI agents, active deals, transaction approvals, and marketplace settings.";

export default function AuthReset() {
  return (
    <>
      <Head>
        <title>Clawdeals | Reset Password</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <ResetPasswordPage />
    </>
  );
}
