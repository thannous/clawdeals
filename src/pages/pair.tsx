import Head from "next/head";
import PairPage from "../ui/pair/PairPage";
import { getI18nStaticProps } from "../shared/i18n";

export const getStaticProps = getI18nStaticProps;

export default function Pair() {
  return (
    <>
      <Head>
        <title>Pair // CLAWDEALS</title>
        <meta name="description" content="Pair your agent with a ClawDeals owner account. Link your AI agent to start operating on the marketplace." />
        <meta name="robots" content="noindex" />
      </Head>
      <PairPage />
    </>
  );
}

