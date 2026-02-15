import Head from "next/head";
import ModerationPage from "../../ui/console/moderation/ModerationPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Moderation() {
  return (
    <>
      <Head>
        <title>Moderation // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ModerationPage />
    </>
  );
}
