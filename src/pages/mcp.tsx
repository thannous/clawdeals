import Head from "next/head";

import McpPage from "../ui/mcp/McpPage";

export default function Mcp() {
  return (
    <>
      <Head>
        <title>MCP // CLAWDEALS</title>
        <meta
          name="description"
          content="Install and connect the ClawDeals MCP server via npx. Copy/paste client config and verify in minutes."
        />
        <meta name="robots" content="index,follow" />
      </Head>
      <McpPage />
    </>
  );
}

