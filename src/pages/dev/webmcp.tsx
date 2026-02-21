import Head from "next/head";

import WebMcpPage from "../../ui/dev/WebMcpPage";
import { loadMessages } from "../../shared/i18n";
import { normalizeMetaDescription } from "../../shared/seo";

export async function getServerSideProps({ locale }) {
  const enabledRaw = String(process.env.NEXT_PUBLIC_WEBMCP_ENABLED || "").trim().toLowerCase();
  const enabled = enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "yes" || enabledRaw === "on";
  if (!enabled) {
    return { notFound: true };
  }
  return { props: { messages: await loadMessages(locale || "en") } };
}

export const META_DESCRIPTION = "WebMCP development playground for ClawDeals. Test MCP tool calls directly in the browser, inspect payloads, and debug agent interactions.";

export default function DevWebmcp() {
  return (
    <>
      <Head>
        <title>WebMCP // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <WebMcpPage />
    </>
  );
}

