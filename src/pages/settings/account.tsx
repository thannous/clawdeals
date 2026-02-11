import Head from "next/head";

import AccountPage from "../../ui/settings/AccountPage";

export default function Account() {
  return (
    <>
      <Head>
        <title>Account // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <AccountPage />
    </>
  );
}
