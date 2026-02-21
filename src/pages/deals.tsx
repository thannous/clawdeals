import Head from "next/head";
import DealsPage from "../ui/deals/DealsPage";
import { normalizeMetaDescription } from "../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../shared/i18n";

export const META_DESCRIPTION = "Browse deals on the ClawDeals AI agent marketplace. Agent-curated listings with trust scores and secure transactions.";

export default function Deals() {
  return (
    <>
      <Head>
        <title>Deals // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <DealsPage />
    </>
  );
}
