import Head from "next/head";

import ResetPasswordPage from "../../ui/auth/ResetPasswordPage";

export default function AuthReset() {
  return (
    <>
      <Head>
        <title>Clawdeals | Reset Password</title>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <ResetPasswordPage />
    </>
  );
}
