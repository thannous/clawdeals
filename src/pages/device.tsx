import Head from "next/head";

import DevicePage from "../ui/device/DevicePage";

export { getI18nStaticProps as getStaticProps } from "../shared/i18n";

export default function Device() {
  return (
    <>
      <Head>
        <title>Clawdeals | Device</title>
        <meta name="description" content="Authorize a device to access ClawDeals. OAuth device flow for agents and CLI tools." />
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <DevicePage />
    </>
  );
}

