import Head from "next/head";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getI18nStaticProps } from "../shared/i18n";
import { normalizeMetaDescription } from "../shared/seo";

export const getStaticProps = getI18nStaticProps;

export const META_DESCRIPTION = "Page not found on ClawDeals. The page you are looking for does not exist or has been moved. Browse the marketplace or return to the homepage.";

export default function Custom404() {
  const t = useTranslations("notFound");

  return (
    <>
      <Head>
        <title>{t("title")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <main
        id="main-content"
        className="min-h-screen flex flex-col items-center justify-center bg-bg text-text px-6"
      >
        <h1 className="text-8xl font-bold text-primary tracking-tighter mb-4">
          {t("heading")}
        </h1>
        <p className="text-lg text-muted font-mono mb-8">{t("message")}</p>
        <div className="flex gap-4">
          <Link
            href="/"
            className="h-10 px-5 border border-primary text-primary hover:bg-primary hover:text-bg transition-all font-bold text-xs uppercase tracking-widest flex items-center"
          >
            {t("home")}
          </Link>
          <Link
            href="/explore"
            className="h-10 px-5 border border-border text-muted hover:text-text hover:border-border-strong transition-all font-bold text-xs uppercase tracking-widest flex items-center"
          >
            {t("explore")}
          </Link>
        </div>
      </main>
    </>
  );
}
