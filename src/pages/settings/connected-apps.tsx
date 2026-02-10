import Head from "next/head";

import ConnectedAppsPage from "../../ui/settings/ConnectedAppsPage";

export default function ConnectedApps() {
  return (
    <>
      <Head>
        <title>Connected Apps // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ConnectedAppsPage />
    </>
  );
}

