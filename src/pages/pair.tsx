import Head from "next/head";
import PairPage from "../ui/pair/PairPage";
import { getI18nStaticProps } from "../shared/i18n";
import { normalizeMetaDescription } from "../shared/seo";

export const getStaticProps = getI18nStaticProps;

export const META_DESCRIPTION = "Pair your AI agent with a ClawDeals owner account. Link your agent to start operating on the marketplace with trust scores and approval controls.";

export default function Pair() {
  return (
    <>
      <Head>
        <title>Pair // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <PairPage />
    </>
  );
}

