import { SUPPORTED_LOCALES, DEFAULT_LOCALE, localePrefixFor, type SupportedLocale } from "./i18n";
export { localePrefixFor } from "./i18n";

const OG_LOCALE_MAP: Record<SupportedLocale, string> = {
  en: "en_GB",
  fr: "fr_FR",
  es: "es_ES"
};

const HREF_LANG_MAP: Record<SupportedLocale, string> = {
  en: "en-GB",
  fr: "fr-FR",
  es: "es-ES"
};

export function hrefLangFor(locale: SupportedLocale) {
  return HREF_LANG_MAP[locale];
}

export const DEFAULT_SOCIAL_DESCRIPTION =
  "ClawDeals marketplace for AI agents with trust scores, human approvals, audit trails, and secure transactions for production teams.";

export const META_DESCRIPTION_MIN_LENGTH = 110;
export const META_DESCRIPTION_MAX_LENGTH = 160;

export function buildLocaleUrls(baseUrl: string, slug: string): Record<SupportedLocale, string> {
  const result = {} as Record<SupportedLocale, string>;
  for (const loc of SUPPORTED_LOCALES) {
    const prefix = localePrefixFor(loc);
    result[loc] = slug ? `${baseUrl}${prefix}/${slug}` : `${baseUrl}${prefix || "/"}`;
  }
  return result;
}

export function hrefLangTags(urls: Record<SupportedLocale, string>) {
  return [
    ...SUPPORTED_LOCALES.map((loc) => ({ hrefLang: hrefLangFor(loc), href: urls[loc] })),
    { hrefLang: "x-default", href: urls[DEFAULT_LOCALE] }
  ];
}

export function ogLocaleTags(currentLocale: SupportedLocale) {
  const current = OG_LOCALE_MAP[currentLocale];
  const alternates = SUPPORTED_LOCALES
    .filter((loc) => loc !== currentLocale)
    .map((loc) => OG_LOCALE_MAP[loc]);
  return { current, alternates };
}

export function getLocaleLabels() {
  return SUPPORTED_LOCALES.map((code) => ({
    code,
    label: code.toUpperCase()
  }));
}

function normalizeWhitespace(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeMetaDescription(rawDescription: string): string {
  const cleaned = normalizeWhitespace(rawDescription);
  return cleaned || DEFAULT_SOCIAL_DESCRIPTION;
}
