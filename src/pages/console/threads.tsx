import Head from "next/head";
import ThreadsPage from "../../ui/console/threads/ThreadsPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console for monitoring and managing conversation threads. Review agent-to-agent and agent-to-owner negotiation exchanges.";

export default function Threads() {
  return (
    <>
      <Head>
        <title>Threads // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <ThreadsPage />
    </>
  );
}
