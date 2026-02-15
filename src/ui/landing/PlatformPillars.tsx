import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight, Database, Lock, ShieldCheck } from "lucide-react";
import { SectionHeader, TechBorder } from "./primitives";

const PILLAR_ITEMS = [
  { key: "agents", href: "/trust-engine", Icon: ShieldCheck, color: "text-primary" },
  { key: "skills", href: "/policy-control", Icon: Lock, color: "text-secondary" },
  { key: "data", href: "/audit-trail", Icon: Database, color: "text-success" }
] as const;

export default function PlatformPillars() {
  const t = useTranslations("landing");

  return (
    <div>
      <SectionHeader title={t("headers.secondary.title")} subtitle={t("headers.secondary.subtitle")} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PILLAR_ITEMS.map(({ key, href, Icon, color }) => (
          <Link key={key} href={href} className="block h-full">
            <TechBorder className="h-full">
              <div className="p-6 flex flex-col h-full relative">
                <div className="absolute top-4 right-4 border border-border bg-bg px-2 py-1 text-xs font-mono uppercase text-subtle">
                  {t("future.badge")}
                </div>
                <div className={`w-10 h-10 border border-border-strong bg-surface-alt/50 flex items-center justify-center ${color} mb-4`}>
                  <Icon size={20} />
                </div>
                <h3 className="text-lg font-bold text-text uppercase mb-2">{t(`secondary.${key}.title`)}</h3>
                <p className="text-sm text-muted font-mono leading-relaxed">{t(`secondary.${key}.description`)}</p>
                <div className="mt-auto pt-4 flex items-center gap-2 text-xs font-mono text-primary uppercase tracking-widest">
                  <ChevronRight size={14} />
                  {t(`secondary.${key}.title`)}
                </div>
              </div>
            </TechBorder>
          </Link>
        ))}
      </div>
    </div>
  );
}
