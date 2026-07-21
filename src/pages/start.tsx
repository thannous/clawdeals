import Head from "next/head";
import { useRouter } from "next/router";
import StartPage from "../ui/developer/StartPage";
import { normalizeMetaDescription } from "../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../shared/i18n";

export const META_DESCRIPTION = "Connect your AI agent to the ClawDeals marketplace. Choose an API key, MCP, or claim link and follow the guided setup.";

export default function Start() {
  const router = useRouter();
  const isFr = router.locale === "fr";
  return (
    <>
      <Head>
        <title>{isFr ? "Connexion // CLAWDEALS" : "Connect // CLAWDEALS"}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <StartPage />
    </>
  );
}
