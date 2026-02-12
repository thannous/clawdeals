import Head from "next/head";
import { useRouter } from "next/router";
import ComingSoonPage from "../ui/ComingSoonPage";

const COPY = {
  fr: {
    badge: "EN DEVELOPPEMENT",
    description: "Cette page est en cours de design et developpement."
  },
  en: {
    badge: "COMING SOON",
    description: "This page is under design and development."
  }
};

export default function TrustEngine() {
  const router = useRouter();
  const locale = router.locale === "fr" ? "fr" : "en";
  const copy = COPY[locale];

  return (
    <>
      <Head>
        <title>Trust Engine (Coming Soon) // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ComingSoonPage title="Trust Engine" badge={copy.badge} description={copy.description} />
    </>
  );
}

