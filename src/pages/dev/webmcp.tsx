import Head from "next/head";

import WebMcpPage from "../../ui/dev/WebMcpPage";

export async function getServerSideProps() {
  const enabledRaw = String(process.env.NEXT_PUBLIC_WEBMCP_ENABLED || "").trim().toLowerCase();
  const enabled = enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "yes" || enabledRaw === "on";
  if (!enabled) {
    return { notFound: true };
  }
  return { props: {} };
}

export default function DevWebmcp() {
  return (
    <>
      <Head>
        <title>WebMCP // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <WebMcpPage />
    </>
  );
}

