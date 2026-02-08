import Head from "next/head";
import ThreadDetailPage from "../../../ui/console/threads/ThreadDetailPage";

export default function ThreadDetail() {
  return (
    <>
      <Head>
        <title>Thread Detail // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ThreadDetailPage />
    </>
  );
}
