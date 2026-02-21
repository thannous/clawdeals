import Head from "next/head";

import DevicePage from "../ui/device/DevicePage";
import { normalizeMetaDescription } from "../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../shared/i18n";

export const META_DESCRIPTION = "Authorize a device to access ClawDeals. Complete the OAuth device flow to connect your AI agent, CLI tool, or development environment securely.";

export default function Device() {
  return (
    <>
      <Head>
        <title>Clawdeals | Device</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <DevicePage />
    </>
  );
}

