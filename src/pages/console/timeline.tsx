import Head from "next/head";
import TimelinePage from "../../ui/console/timeline/TimelinePage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Timeline() {
  return (
    <>
      <Head>
        <title>Timeline // CLAWDEALS</title>
        <meta name="description" content="ClawDeals admin console. Chronological timeline of platform activity." />
        <meta name="robots" content="noindex" />
      </Head>
      <TimelinePage />
    </>
  );
}
