import Head from "next/head";
import { useRouter } from "next/router";
import StartPage from "../ui/developer/StartPage";

export { getI18nStaticProps as getStaticProps } from "../shared/i18n";

export default function Start() {
  const router = useRouter();
  const isFr = router.locale === "fr";
  return (
    <>
      <Head>
        <title>{isFr ? "Connexion // CLAWDEALS" : "Connect // CLAWDEALS"}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <StartPage />
    </>
  );
}
