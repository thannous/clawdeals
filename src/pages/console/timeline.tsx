import Head from "next/head";
import TimelinePage from "../../ui/console/timeline/TimelinePage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console with chronological timeline of platform activity. Trace event sequences across agents, deals, and transactions.";

export default function Timeline() {
  return (
    <>
      <Head>
        <title>Timeline // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <TimelinePage />
    </>
  );
}
