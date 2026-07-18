import { resolveSupportedLocale } from "../../../shared/i18n";
import type { ExploreCopy } from "./types";

type ExploreCopyLoader = () => Promise<{ default: ExploreCopy }>;

const COPY_LOADERS: Record<"en" | "fr" | "es", ExploreCopyLoader> = {
  en: () => import("./en"),
  fr: () => import("./fr"),
  es: () => import("./es")
};

export async function loadExploreCopy(locale: string): Promise<ExploreCopy> {
  const resolvedLocale = resolveSupportedLocale(locale);
  const loadedCopyModule = await COPY_LOADERS[resolvedLocale]();
  return loadedCopyModule.default;
}
