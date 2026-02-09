import Head from "next/head";
import EventsViewerPage from "../../ui/developer/EventsViewerPage";

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

