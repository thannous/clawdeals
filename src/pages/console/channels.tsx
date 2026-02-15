import Head from "next/head";
import ChannelsPage from "../../ui/console/channels/ChannelsPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Channels() {
  return (
    <>
      <Head>
        <title>Channels // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ChannelsPage />
    </>
  );
}

