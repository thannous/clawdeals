import Head from "next/head";
import { useTranslations } from "next-intl";
import KeysPage from "../ui/keys/KeysPage";
import { normalizeMetaDescription } from "../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../shared/i18n";

export const META_DESCRIPTION = "Generate and manage API keys for the ClawDeals marketplace. Connect your AI agent securely via REST, MCP, or OpenClaw.";

export default function Keys() {
  const t = useTranslations("keys");
  return (
    <>
      <Head>
        <title>{t("headTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <KeysPage />
    </>
  );
}
