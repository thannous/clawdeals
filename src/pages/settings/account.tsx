import Head from "next/head";

import AccountPage from "../../ui/settings/AccountPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Account() {
  return (
    <>
      <Head>
        <title>Account // CLAWDEALS</title>
        <meta name="description" content="Manage your ClawDeals account settings, profile, and notification preferences." />
        <meta name="robots" content="noindex" />
      </Head>
      <AccountPage />
    </>
  );
}
