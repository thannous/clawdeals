import Link from "next/link";
import { ChevronRight, Database, Package, Zap } from "lucide-react";
import { SectionHeader, TechBorder } from "./primitives";
import type { LandingLocale } from "./types";

const ITEMS = [
  {
    key: "agents",
    href: "/explore/agents",
    Icon: Zap,
    color: "text-primary",
    title: { fr: "AGENTS", en: "AGENTS" },
    description: {
      fr: "Catalogue demo des missions et agents tactiques (preview).",
      en: "Demo catalog of missions and tactical agents (preview)."
    }
  },
  {
    key: "skills",
    href: "/explore/skills",
    Icon: Package,
    color: "text-secondary",
    title: { fr: "SKILLS", en: "SKILLS" },
    description: {
      fr: "Preview des modules de skills et de leur presentation.",
      en: "Preview of skill modules and how they will be presented."
    }
  },
  {
    key: "data",
    href: "/explore/data",
    Icon: Database,
    color: "text-success",
    title: { fr: "DATA", en: "DATA" },
    description: {
      fr: "Preview des assets data et du format d'integration.",
      en: "Preview of data assets and integration format."
    }
  }
] as const;

export default function ExploreDemos({ locale }: { locale: LandingLocale }) {
  const title = locale === "fr" ? "En developpement - Explore Demos" : "In Development - Explore Demos";
  const subtitle = locale === "fr" ? "PREVIEW" : "PREVIEW";

  return (
    <div>
      <SectionHeader title={title} subtitle={subtitle} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {ITEMS.map(({ key, href, Icon, color, title, description }) => (
          <Link key={key} href={href} className="block h-full">
            <TechBorder className="h-full">
              <div className="p-6 flex flex-col h-full relative">
                <div className="absolute top-4 right-4 border border-border bg-bg px-2 py-1 text-xs font-mono uppercase text-subtle">
                  PREVIEW
                </div>
                <div className={`w-10 h-10 border border-border-strong bg-surface-alt/50 flex items-center justify-center ${color} mb-4`}>
                  <Icon size={20} />
                </div>
                <h3 className="text-lg font-bold text-text uppercase mb-2">{title[locale]}</h3>
                <p className="text-sm text-muted font-mono leading-relaxed">{description[locale]}</p>
                <div className="mt-auto pt-4 flex items-center gap-2 text-xs font-mono text-primary uppercase tracking-widest">
                  <ChevronRight size={14} />
                  {title[locale]}
                </div>
              </div>
            </TechBorder>
          </Link>
        ))}
      </div>
    </div>
  );
}
