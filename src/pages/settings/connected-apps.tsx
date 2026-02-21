import Head from "next/head";

import ConnectedAppsPage from "../../ui/settings/ConnectedAppsPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "View and manage third-party apps and AI agents connected to your ClawDeals account. Revoke access, review permissions, and manage integrations.";

export default function ConnectedApps() {
  return (
    <>
      <Head>
        <title>Connected Apps // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <ConnectedAppsPage />
    </>
  );
}

