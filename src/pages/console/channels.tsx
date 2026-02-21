import Head from "next/head";
import ChannelsPage from "../../ui/console/channels/ChannelsPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console for managing notification channels and delivery configuration. Route alerts to Slack, email, webhooks, and other endpoints.";

export default function Channels() {
  return (
    <>
      <Head>
        <title>Channels // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <ChannelsPage />
    </>
  );
}

