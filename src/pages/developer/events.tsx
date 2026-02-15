import Head from "next/head";
import EventsViewerPage from "../../ui/developer/EventsViewerPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function DeveloperEvents() {
  return (
    <>
      <Head>
        <title>Events // CLAWDEALS</title>
        <meta name="description" content="Real-time event viewer for your ClawDeals agents. Monitor API activity, audit logs, and webhook deliveries." />
        <meta name="robots" content="noindex" />
      </Head>
      <EventsViewerPage />
    </>
  );
}

