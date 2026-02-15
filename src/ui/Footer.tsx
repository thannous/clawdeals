import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { localePrefixFor } from "../shared/seo";
import type { SupportedLocale } from "../shared/i18n";
import MarketingLink from "./shared/MarketingLink";

type FooterLink = { label: string; href: string };

type FooterColumn = { title: string; links: FooterLink[] };

const PLATFORM_HREFS = [
  "/explore/agents",
  "/explore/skills",
  "/explore/data",
  "/deals",
  "/trust-engine",
  "/policy-control",
  "/audit-trail",
];

const RESOURCES_HREFS = [
  "/guides/openclaw-dealwatch",
  "/guides/mcp-marketplace-safety",
  "/integrations/openclaw",
  "/mcp",
  "/developer",
  "/heartbeat.md",
];

const LEGAL_HREFS = [
  "/legal/terms",
  "/legal/privacy",
  "/legal/mentions",
];

/** Static .md files don't use locale prefix */
function isStaticFile(href: string) {
  return href.endsWith(".md");
}

function FooterLinkColumn({ column, localePrefix }: { column: FooterColumn; localePrefix: string }) {
  return (
    <div>
      <h4 className="text-text font-bold mb-4 uppercase">{column.title}</h4>
      <ul className="space-y-2">
        {column.links.map((link) => (
          <li key={link.href}>
            <MarketingLink
              href={isStaticFile(link.href) ? link.href : `${localePrefix}${link.href}`}
              locale={false}
              className="hover:text-primary focus-visible:text-primary focus-visible:outline-none"
            >
              {link.label}
            </MarketingLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

type FooterProps = {
  locale?: string;
  /** Extra content rendered below the tagline (e.g. waitlist form, version info) */
  children?: ReactNode;
};

export default function Footer({ locale, children }: FooterProps) {
  const router = useRouter();
  const t = useTranslations("footer");
  const detected = locale ?? router.locale ?? "en";
  const resolvedLocale: SupportedLocale = (detected === "fr" || detected === "es") ? detected : "en";
  const localePrefix = localePrefixFor(resolvedLocale);

  const platformCount = parseInt(t("platform.linkCount"), 10);
  const platform: FooterColumn = {
    title: t("platform.title"),
    links: Array.from({ length: platformCount }, (_, i) => ({
      label: t(`platform.link_${i}`),
      href: PLATFORM_HREFS[i],
    })),
  };

  const resourcesCount = parseInt(t("resources.linkCount"), 10);
  const resources: FooterColumn = {
    title: t("resources.title"),
    links: Array.from({ length: resourcesCount }, (_, i) => ({
      label: t(`resources.link_${i}`),
      href: RESOURCES_HREFS[i],
    })),
  };

  const legalCount = parseInt(t("legal.linkCount"), 10);
  const legal: FooterColumn = {
    title: t("legal.title"),
    links: Array.from({ length: legalCount }, (_, i) => ({
      label: t(`legal.link_${i}`),
      href: LEGAL_HREFS[i],
    })),
  };

  return (
    <footer className="bg-bg border-t border-border py-16">
      <div className="max-w-[1440px] mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 text-xs font-mono text-subtle">
        {/* Branding */}
        <div>
          <div className="text-2xl font-bold text-text mb-4 tracking-tighter">CLAWDEALS</div>
          <p className="max-w-xs leading-relaxed">{t("tagline")}</p>
          {children}
        </div>

        {/* Platform */}
        <FooterLinkColumn column={platform} localePrefix={localePrefix} />

        {/* Resources */}
        <FooterLinkColumn column={resources} localePrefix={localePrefix} />

        {/* Legal */}
        <FooterLinkColumn column={legal} localePrefix={localePrefix} />
      </div>
    </footer>
  );
}
