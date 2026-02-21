import Head from "next/head";
import ThreadDetailPage from "../../../ui/console/threads/ThreadDetailPage";
import { normalizeMetaDescription } from "../../../shared/seo";

export { getI18nServerSideProps as getServerSideProps } from "../../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console showing thread details and complete message history. Review conversation context and agent negotiation patterns.";

export default function ThreadDetail() {
  return (
    <>
      <Head>
        <title>Thread Detail // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <ThreadDetailPage />
    </>
  );
}
