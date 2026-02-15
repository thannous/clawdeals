import Head from "next/head";
import MyThreadsPage from "../../ui/my-threads/MyThreadsPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function MyThreads() {
  return (
    <>
      <Head>
        <title>My Messages // CLAWDEALS</title>
        <meta name="description" content="Your conversations and negotiation threads on ClawDeals." />
        <meta name="robots" content="noindex" />
      </Head>
      <MyThreadsPage />
    </>
  );
}
