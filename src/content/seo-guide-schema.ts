import { getSeoGuide, type GuideSlug } from "./seo-guides";
import type { SupportedLocale } from "../shared/i18n";
import { buildLocaleUrls } from "../shared/seo";
import { getSeoGuideEnhancement } from "./seo-guide-enhancements";

const GUIDE_LABELS: Record<SupportedLocale, string> = {
  en: "Guides",
  fr: "Guides",
  es: "Guías"
};

function languageTag(locale: SupportedLocale) {
  if (locale === "fr") return "fr-FR";
  if (locale === "es") return "es-ES";
  return "en-GB";
}

export function buildSeoGuideStructuredData({
  slug,
  locale,
  baseUrl
}: {
  slug: GuideSlug;
  locale: SupportedLocale;
  baseUrl: string;
}) {
  const guide = getSeoGuide(slug);
  const content = guide.content[locale];
  const enhancement = getSeoGuideEnhancement(slug, locale);
  const canonicalUrl = buildLocaleUrls(baseUrl, `guides/${slug}`)[locale];
  const guidesUrl = buildLocaleUrls(baseUrl, "guides")[locale];
  const editorialUrl = buildLocaleUrls(baseUrl, "about/editorial")[locale];
  const ogImageUrl = `${baseUrl}/og/${locale}.png`;
  const schemaSteps = guide.schemaType === "HowTo"
    ? content.sections.map((section, index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name: section.title,
        text: [...section.paragraphs, ...(section.bullets || [])].join(" "),
        url: `${canonicalUrl}#${section.id}`
      }))
    : undefined;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": guide.schemaType,
        "@id": `${canonicalUrl}#article`,
        url: canonicalUrl,
        mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
        name: content.title,
        headline: content.title,
        description: content.metaDescription,
        image: ogImageUrl,
        datePublished: guide.publishedAt,
        dateModified: guide.updatedAt,
        author: {
          "@type": "Organization",
          "@id": `${editorialUrl}#team`,
          name: "ClawDeals Editorial Team",
          url: editorialUrl
        },
        publisher: {
          "@type": "Organization",
          name: "ClawDeals",
          url: baseUrl,
          logo: { "@type": "ImageObject", url: `${baseUrl}/favicon-192.png` }
        },
        inLanguage: languageTag(locale),
        isPartOf: { "@id": `${baseUrl}/#website` },
        ...(schemaSteps ? { step: schemaSteps } : { articleSection: content.sections.map((section) => section.title) })
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "ClawDeals", item: baseUrl },
          { "@type": "ListItem", position: 2, name: GUIDE_LABELS[locale], item: guidesUrl },
          { "@type": "ListItem", position: 3, name: content.title, item: canonicalUrl }
        ]
      },
      {
        "@type": "FAQPage",
        "@id": `${canonicalUrl}#faq`,
        url: `${canonicalUrl}#faq`,
        inLanguage: languageTag(locale),
        isPartOf: { "@id": canonicalUrl },
        mainEntity: enhancement.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer
          }
        }))
      }
    ]
  };
}
