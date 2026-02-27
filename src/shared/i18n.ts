import type { GetStaticPropsContext, GetServerSidePropsContext } from "next";

export const SUPPORTED_LOCALES = ["en", "fr", "es"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";
export type Messages = Record<string, any>;
export type MessageNamespace = string;
export type MessageLoadOptions = {
  namespaces?: readonly MessageNamespace[];
};
const LOCALE_PREFIX_RE = /^\/(en|fr|es)(?=\/|$)/;
const CLAIM_PATH_RE = /^\/(?:(en|fr|es)\/)?claim\/([^/?#]+)/;

export function parseSupportedLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const primary = normalized.split("-")[0];
  if (!primary) return null;
  return SUPPORTED_LOCALES.includes(primary as SupportedLocale) ? (primary as SupportedLocale) : null;
}

export function resolveSupportedLocale(value: unknown): SupportedLocale {
  return parseSupportedLocale(value) || DEFAULT_LOCALE;
}

export function localePrefixFor(locale: SupportedLocale): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

export function splitLocalePrefix(pathname: string) {
  const raw = String(pathname || "/");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const match = path.match(LOCALE_PREFIX_RE);
  if (!match?.[1]) {
    return {
      locale: null as SupportedLocale | null,
      localePrefix: "",
      rest: path
    };
  }
  const locale = match[1] as SupportedLocale;
  const localePrefix = `/${locale}`;
  const rest = path.slice(localePrefix.length) || "/";
  return {
    locale,
    localePrefix,
    rest: rest.startsWith("/") ? rest : `/${rest}`
  };
}

export function stripLocalePrefix(pathname: string): string {
  return splitLocalePrefix(pathname).rest || "/";
}

export function extractClaimTokenFromPath(pathname: string): string {
  const rawPath = String(pathname || "").split("?")[0] || "";
  const match = rawPath.match(CLAIM_PATH_RE);
  if (!match?.[2]) return "";
  const value = String(match[2]).trim();
  if (!value || (value.startsWith("[") && value.endsWith("]"))) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Load all messages for the given locale.
 * Used by getServerSideProps and getStaticProps on every page.
 */
function normalizeNamespaces(namespaces?: readonly MessageNamespace[]): MessageNamespace[] {
  if (!Array.isArray(namespaces) || namespaces.length === 0) return [];
  return Array.from(new Set(namespaces.map((namespace) => String(namespace || "").trim()).filter(Boolean)));
}

function pickMessageNamespaces(messages: Messages, namespaces?: readonly MessageNamespace[]): Messages {
  const requested = normalizeNamespaces(namespaces);
  if (requested.length === 0) return messages;
  const scoped: Messages = {};

  for (const namespace of requested) {
    if (Object.prototype.hasOwnProperty.call(messages, namespace)) {
      scoped[namespace] = messages[namespace];
    }
  }

  return scoped;
}

export async function loadMessages(locale: string, options?: MessageLoadOptions) {
  const resolved = resolveSupportedLocale(locale);
  const allMessages = (await import(`../../messages/${resolved}.json`)).default as Messages;
  return pickMessageNamespaces(allMessages, options?.namespaces);
}

/**
 * Load only selected message namespaces for the given locale.
 * Useful for routes that don't need the entire i18n payload.
 */
export async function loadMessagesForNamespaces(
  locale: string,
  namespaces: readonly MessageNamespace[]
) {
  return loadMessages(locale, { namespaces });
}

/**
 * Minimal getStaticProps that only loads messages.
 * Add to every CSR-only page that has no getStaticProps/getServerSideProps.
 */
export async function getI18nStaticProps(ctx: GetStaticPropsContext, options?: MessageLoadOptions) {
  return {
    props: {
      messages: await loadMessages(ctx.locale || DEFAULT_LOCALE, options)
    }
  };
}

/**
 * Minimal getServerSideProps that only loads messages.
 * Use for dynamic routes ([param]) that cannot use getStaticProps.
 */
export async function getI18nServerSideProps(ctx: GetServerSidePropsContext, options?: MessageLoadOptions) {
  return {
    props: {
      messages: await loadMessages(ctx.locale || DEFAULT_LOCALE, options)
    }
  };
}

/**
 * Merge messages into existing getServerSideProps return value.
 */
export async function withMessages<T extends Record<string, any>>(
  locale: string | undefined,
  existingProps: T,
  options?: MessageLoadOptions
): Promise<T & { messages: any }> {
  return {
    ...existingProps,
    messages: await loadMessages(locale || DEFAULT_LOCALE, options)
  };
}
