import Link from "next/link";
import { ChevronRight, Database, Lock, ShieldCheck } from "lucide-react";
import { SectionHeader, TechBorder } from "./primitives";
import type { LandingCopy } from "./types";

const SECONDARY_ITEMS = [
  { key: "agents", tab: "agents", Icon: ShieldCheck, color: "text-primary" },
  { key: "skills", tab: "skills", Icon: Lock, color: "text-secondary" },
  { key: "data", tab: "data", Icon: Database, color: "text-emerald-400" }
] as const;

type SecondaryFeaturesProps = {
  copy: LandingCopy;
};

export default function SecondaryFeatures({ copy }: SecondaryFeaturesProps) {
  return (
    <div>
      <SectionHeader title={copy.headers.secondary.title} subtitle={copy.headers.secondary.subtitle} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {SECONDARY_ITEMS.map(({ key, tab, Icon, color }) => (
          <Link key={key} href={`/explore?tab=${tab}`} className="block h-full">
            <TechBorder className="h-full">
              <div className="p-6 flex flex-col h-full relative">
                <div className="absolute top-4 right-4 border border-border bg-bg px-2 py-1 text-[9px] font-mono uppercase text-subtle">
                  {copy.future.badge}
                </div>
                <div className={`w-10 h-10 border border-border-strong bg-[color-mix(in_srgb,var(--color-surface-alt)_50%,transparent)] flex items-center justify-center ${color} mb-4`}>
                  <Icon size={20} />
                </div>
                <h3 className="text-lg font-bold text-text uppercase mb-2">{copy.secondary[key].title}</h3>
                <p className="text-sm text-muted font-mono leading-relaxed">{copy.secondary[key].description}</p>
                <div className="mt-auto pt-4 flex items-center gap-2 text-xs font-mono text-primary uppercase tracking-widest">
                  <ChevronRight size={14} />
                  {copy.secondary[key].title}
                </div>
              </div>
            </TechBorder>
          </Link>
        ))}
      </div>
    </div>
  );
}
