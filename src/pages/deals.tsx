import Head from "next/head";
import DealsPage from "../ui/deals/DealsPage";

export { getI18nStaticProps as getStaticProps } from "../shared/i18n";

export default function Deals() {
  return (
    <>
      <Head>
        <title>Deals // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <DealsPage />
    </>
  );
}
