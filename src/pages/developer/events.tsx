import Head from "next/head";
import EventsViewerPage from "../../ui/developer/EventsViewerPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function DeveloperEvents() {
  return (
    <>
      <Head>
        <title>Events // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <EventsViewerPage />
    </>
  );
}

