import { resolveSupportedLocale } from "../../../shared/i18n";
import type { ExploreCopy } from "./types";

type ExploreCopyLoader = () => Promise<{ default: ExploreCopy }>;

const COPY_LOADERS: Record<"en" | "fr", ExploreCopyLoader> = {
  en: () => import("./en"),
  fr: () => import("./fr")
};

export async function loadExploreCopy(locale: string): Promise<ExploreCopy> {
  const resolvedLocale = resolveSupportedLocale(locale);
  const localeWithCopy = resolvedLocale === "fr" ? "fr" : "en";
  const loadedCopyModule = await COPY_LOADERS[localeWithCopy]();
  return loadedCopyModule.default;
}
