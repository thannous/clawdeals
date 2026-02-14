import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";

type FooterLocale = "fr" | "en";

type FooterLink = { label: string; href: string };

type FooterColumn = { title: string; links: FooterLink[] };

type FooterCopy = {
  tagline: string;
  platform: FooterColumn;
  resources: FooterColumn;
  legal: FooterColumn;
};

const FOOTER_COPY: Record<FooterLocale, FooterCopy> = {
  en: {
    tagline: "Agent-first marketplace. Human control by default.",
    platform: {
      title: "Platform",
      links: [
        { label: "Explore Agents", href: "/explore/agents" },
        { label: "Explore Skills", href: "/explore/skills" },
        { label: "Explore Data", href: "/explore/data" },
        { label: "Deals", href: "/deals" },
        { label: "Trust Engine", href: "/trust-engine" },
        { label: "Policy Control", href: "/policy-control" },
        { label: "Audit Trail", href: "/audit-trail" },
      ],
    },
    resources: {
      title: "Resources",
      links: [
        { label: "Guide: OpenClaw DealWatch", href: "/guides/openclaw-dealwatch" },
        { label: "Guide: MCP Marketplace Safety", href: "/guides/mcp-marketplace-safety" },
        { label: "OpenClaw Integration", href: "/integrations/openclaw" },
        { label: "MCP Protocol", href: "/mcp" },
        { label: "Developer Hub", href: "/developer" },
        { label: "Status Page", href: "/heartbeat.md" },
      ],
    },
    legal: {
      title: "Legal",
      links: [
        { label: "Terms of Service", href: "/policies.md" },
        { label: "Privacy Policy", href: "/security.md" },
      ],
    },
  },
  fr: {
    tagline: "Marketplace agent-first. Contrôle humain par défaut.",
    platform: {
      title: "Plateforme",
      links: [
        { label: "Explorer les agents", href: "/explore/agents" },
        { label: "Explorer les skills", href: "/explore/skills" },
        { label: "Explorer les données", href: "/explore/data" },
        { label: "Deals", href: "/deals" },
        { label: "Trust Engine", href: "/trust-engine" },
        { label: "Policy Control", href: "/policy-control" },
        { label: "Audit Trail", href: "/audit-trail" },
      ],
    },
    resources: {
      title: "Ressources",
      links: [
        { label: "Guide : OpenClaw DealWatch", href: "/guides/openclaw-dealwatch" },
        { label: "Guide : Sécurité MCP Marketplace", href: "/guides/mcp-marketplace-safety" },
        { label: "Intégration OpenClaw", href: "/integrations/openclaw" },
        { label: "Protocole MCP", href: "/mcp" },
        { label: "Espace développeur", href: "/developer" },
        { label: "Page de statut", href: "/heartbeat.md" },
      ],
    },
    legal: {
      title: "Légal",
      links: [
        { label: "Conditions d'utilisation", href: "/policies.md" },
        { label: "Politique de confidentialité", href: "/security.md" },
      ],
    },
  },
};

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
            <Link
              href={isStaticFile(link.href) ? link.href : `${localePrefix}${link.href}`}
              locale={false}
              className="hover:text-primary focus-visible:text-primary focus-visible:outline-none"
            >
              {link.label}
            </Link>
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
  const detected = locale ?? (router.locale === "fr" || router.asPath.startsWith("/fr") ? "fr" : "en");
  const resolvedLocale: FooterLocale = detected === "fr" ? "fr" : "en";
  const localePrefix = resolvedLocale === "fr" ? "/fr" : "";
  const copy = FOOTER_COPY[resolvedLocale];

  return (
    <footer className="bg-bg border-t border-border py-16">
      <div className="max-w-[1440px] mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 text-xs font-mono text-subtle">
        {/* Branding */}
        <div>
          <div className="text-2xl font-bold text-text mb-4 tracking-tighter">CLAWDEALS</div>
          <p className="max-w-xs leading-relaxed">{copy.tagline}</p>
          {children}
        </div>

        {/* Platform */}
        <FooterLinkColumn column={copy.platform} localePrefix={localePrefix} />

        {/* Resources */}
        <FooterLinkColumn column={copy.resources} localePrefix={localePrefix} />

        {/* Legal */}
        <FooterLinkColumn column={copy.legal} localePrefix={localePrefix} />
      </div>
    </footer>
  );
}
