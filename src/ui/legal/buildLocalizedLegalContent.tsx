import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { SupportedLocale } from "../../shared/i18n";

type LegalContentComponent = ComponentType<Record<string, never>>;
type LocaleContentLoader = () => Promise<{ default: LegalContentComponent }>;
type LocaleContentLoaders = Record<SupportedLocale, LocaleContentLoader>;

type LocalizedLegalContentProps = {
  locale: SupportedLocale;
};

export function buildLocalizedLegalContent(loaders: LocaleContentLoaders) {
  const contentByLocale: Record<SupportedLocale, LegalContentComponent> = {
    en: dynamic(loaders.en, { ssr: true }),
    fr: dynamic(loaders.fr, { ssr: true }),
    es: dynamic(loaders.es, { ssr: true })
  };

  return function LocalizedLegalContent({ locale }: LocalizedLegalContentProps) {
    const Content = contentByLocale[locale];
    return <Content />;
  };
}
