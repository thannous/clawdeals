import Head from "next/head";

import ConnectedAppsPage from "../../ui/settings/ConnectedAppsPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function ConnectedApps() {
  return (
    <>
      <Head>
        <title>Connected Apps // CLAWDEALS</title>
        <meta name="description" content="View and manage third-party apps and agents connected to your ClawDeals account." />
        <meta name="robots" content="noindex" />
      </Head>
      <ConnectedAppsPage />
    </>
  );
}

