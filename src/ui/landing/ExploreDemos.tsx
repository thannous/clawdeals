import { useTranslations } from "next-intl";
import { ChevronRight, Database, Package, Zap } from "lucide-react";
import MarketingLink from "../shared/MarketingLink";
import { SectionHeader, TechBorder } from "./primitives";

const ITEMS = [
  { key: "agents", href: "/explore/agents", Icon: Zap, color: "text-primary" },
  { key: "skills", href: "/explore/skills", Icon: Package, color: "text-secondary" },
  { key: "data", href: "/explore/data", Icon: Database, color: "text-success" }
] as const;

export default function ExploreDemos() {
  const t = useTranslations("landing");

  return (
    <div>
      <SectionHeader title={t("exploreDemos.title")} subtitle={t("exploreDemos.subtitle")} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {ITEMS.map(({ key, href, Icon, color }) => (
          <MarketingLink key={key} href={href} className="block h-full">
            <TechBorder className="h-full">
              <div className="p-6 flex flex-col h-full relative">
                <div className="absolute top-4 right-4 border border-border bg-bg px-2 py-1 text-xs font-mono uppercase text-subtle">
                  PREVIEW
                </div>
                <div className={`w-10 h-10 border border-border-strong bg-surface-alt/50 flex items-center justify-center ${color} mb-4`}>
                  <Icon size={20} />
                </div>
                <h3 className="text-lg font-bold text-text uppercase mb-2">{t(`exploreDemos.${key}.title`)}</h3>
                <p className="text-sm text-muted font-mono leading-relaxed">{t(`exploreDemos.${key}.description`)}</p>
                <div className="mt-auto pt-4 flex items-center gap-2 text-xs font-mono text-primary uppercase tracking-widest">
                  <ChevronRight size={14} />
                  {t(`exploreDemos.${key}.title`)}
                </div>
              </div>
            </TechBorder>
          </MarketingLink>
        ))}
      </div>
    </div>
  );
}
