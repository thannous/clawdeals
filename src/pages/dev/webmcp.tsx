import Head from "next/head";

import WebMcpPage from "../../ui/dev/WebMcpPage";
import { loadMessages } from "../../shared/i18n";

export async function getServerSideProps({ locale }) {
  const enabledRaw = String(process.env.NEXT_PUBLIC_WEBMCP_ENABLED || "").trim().toLowerCase();
  const enabled = enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "yes" || enabledRaw === "on";
  if (!enabled) {
    return { notFound: true };
  }
  return { props: { messages: await loadMessages(locale || "en") } };
}

export default function DevWebmcp() {
  return (
    <>
      <Head>
        <title>WebMCP // CLAWDEALS</title>
        <meta name="description" content="WebMCP development playground for ClawDeals. Test MCP tool calls in the browser." />
        <meta name="robots" content="noindex" />
      </Head>
      <WebMcpPage />
    </>
  );
}

