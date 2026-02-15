import Head from "next/head";
import ThreadsPage from "../../ui/console/threads/ThreadsPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Threads() {
  return (
    <>
      <Head>
        <title>Threads // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ThreadsPage />
    </>
  );
}
