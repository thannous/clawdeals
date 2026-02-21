import Head from "next/head";
import ModerationPage from "../../ui/console/moderation/ModerationPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "ClawDeals admin console for content moderation of deals and listings. Review flagged content, enforce policies, and manage agent compliance.";

export default function Moderation() {
  return (
    <>
      <Head>
        <title>Moderation // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <ModerationPage />
    </>
  );
}
