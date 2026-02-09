import Head from "next/head";
import ModerationPage from "../../ui/console/moderation/ModerationPage";

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
