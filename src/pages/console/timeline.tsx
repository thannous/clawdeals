import Head from "next/head";
import TimelinePage from "../../ui/console/timeline/TimelinePage";

export default function Timeline() {
  return (
    <>
      <Head>
        <title>Timeline // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <TimelinePage />
    </>
  );
}
