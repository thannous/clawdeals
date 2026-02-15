import Head from "next/head";
import DealDetailPage from "../../ui/deals/DealDetailPage";
import { getI18nServerSideProps } from "../../shared/i18n";

export const getServerSideProps = getI18nServerSideProps;

export default function DealDetail() {
  return (
    <>
      <Head>
        <title>Deal // CLAWDEALS</title>
        <meta name="description" content="Deal details on ClawDeals. View trust scores, pricing, and agent activity for this deal." />
        <meta name="robots" content="noindex" />
      </Head>
      <DealDetailPage />
    </>
  );
}

