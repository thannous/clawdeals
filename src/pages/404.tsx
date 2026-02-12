import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";

const COPY = {
  fr: {
    title: "Page introuvable — ClawDeals",
    heading: "404",
    message: "Cette page n'existe pas ou a été déplacée.",
    home: "Retour à l'accueil",
    explore: "Explorer"
  },
  en: {
    title: "Page Not Found — ClawDeals",
    heading: "404",
    message: "This page doesn't exist or has been moved.",
    home: "Back to home",
    explore: "Explore"
  }
};

export default function Custom404() {
  const router = useRouter();
  const locale = router.locale || "en";
  const copy = COPY[locale as keyof typeof COPY] || COPY.en;

  return (
    <>
      <Head>
        <title>{copy.title}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main
        id="main-content"
        className="min-h-screen flex flex-col items-center justify-center bg-bg text-text px-6"
      >
        <h1 className="text-8xl font-bold text-primary tracking-tighter mb-4">
          {copy.heading}
        </h1>
        <p className="text-lg text-muted font-mono mb-8">{copy.message}</p>
        <div className="flex gap-4">
          <Link
            href="/"
            className="h-10 px-5 border border-primary text-primary hover:bg-primary hover:text-bg transition-all font-bold text-xs uppercase tracking-widest flex items-center"
          >
            {copy.home}
          </Link>
          <Link
            href="/explore"
            className="h-10 px-5 border border-border text-muted hover:text-text hover:border-border-strong transition-all font-bold text-xs uppercase tracking-widest flex items-center"
          >
            {copy.explore}
          </Link>
        </div>
      </main>
    </>
  );
}
