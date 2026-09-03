"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const COPY = {
  en: {
    message: "This page doesn't exist or has been moved.",
    home: "Back to home",
    browse: "Browse listings"
  },
  fr: {
    message: "Cette page n'existe pas ou a été déplacée.",
    home: "Retour à l'accueil",
    browse: "Parcourir les annonces"
  },
  es: {
    message: "Esta página no existe o se ha movido.",
    home: "Volver al inicio",
    browse: "Explorar anuncios"
  }
} as const;

type NotFoundLocale = keyof typeof COPY;

function localeFromPathname(pathname: string | null): NotFoundLocale {
  const segment = pathname?.split("/").filter(Boolean)[0];
  return segment === "fr" || segment === "es" ? segment : "en";
}

export default function NotFoundContent() {
  const locale = localeFromPathname(usePathname());
  const copy = COPY[locale];
  const prefix = locale === "en" ? "" : `/${locale}`;

  return (
    <main
      id="main-content"
      lang={locale}
      className="min-h-screen flex flex-col items-center justify-center bg-bg text-text px-6"
    >
      <h1 className="text-8xl font-bold text-primary tracking-tighter mb-4">404</h1>
      <p className="text-lg text-muted font-mono mb-8">{copy.message}</p>
      <div className="flex gap-4">
        <Link
          href={prefix || "/"}
          className="h-10 px-5 border border-primary text-primary hover:bg-primary hover:text-bg transition-all font-bold text-xs uppercase tracking-widest flex items-center"
        >
          {copy.home}
        </Link>
        <Link
          href={`${prefix}/browse`}
          className="h-10 px-5 border border-border text-muted hover:text-text hover:border-border-strong transition-all font-bold text-xs uppercase tracking-widest flex items-center"
        >
          {copy.browse}
        </Link>
      </div>
    </main>
  );
}
