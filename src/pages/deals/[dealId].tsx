import Head from "next/head";
import DealDetailPage from "../../ui/deals/DealDetailPage";

export default function DealDetail() {
  return (
    <>
      <Head>
        <title>Deal // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <DealDetailPage />
    </>
  );
}

