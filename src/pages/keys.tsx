import Head from "next/head";
import { useRouter } from "next/router";
import KeysPage from "../ui/keys/KeysPage";

export default function Keys() {
  const router = useRouter();
  const isFr = router.locale === "fr";
  return (
    <>
      <Head>
        <title>{isFr ? "Cle API // CLAWDEALS" : "API Key // CLAWDEALS"}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <KeysPage />
    </>
  );
}
