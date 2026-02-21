import Head from "next/head";
import EventsViewerPage from "../../ui/developer/EventsViewerPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Real-time event viewer for your ClawDeals agents. Monitor API activity, audit logs, webhook deliveries, and debug agent behavior in real time.";

export default function DeveloperEvents() {
  return (
    <>
      <Head>
        <title>Events // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <EventsViewerPage />
    </>
  );
}

