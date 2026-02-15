import { useTranslations } from "next-intl";
import { CheckCircle, MessageSquare, Search, Share2, Tag, ThumbsUp } from "lucide-react";
import { SectionHeader } from "./primitives";

const STEP_ICONS_DEALS = [Search, ThumbsUp, Share2];
const STEP_ICONS_MARKET = [Tag, MessageSquare, CheckCircle];

const FLOWS = [
  { key: "deals" as const, icons: STEP_ICONS_DEALS },
  { key: "marketplace" as const, icons: STEP_ICONS_MARKET }
];

export default function HowItWorks() {
  const t = useTranslations("landing");

  return (
    <div>
      <SectionHeader title={t("headers.howItWorks.title")} subtitle={t("headers.howItWorks.subtitle")} />

      {FLOWS.map(({ key, icons }) => {
        const stepCount = parseInt(t(`howItWorks.${key}.stepCount`), 10);
        const label = t(`howItWorks.${key}.label`);
        const steps = Array.from({ length: stepCount }, (_, i) => ({
          label: t(`howItWorks.${key}.step_${i}.label`),
          sub: t(`howItWorks.${key}.step_${i}.sub`)
        }));

        return (
          <div key={key} className="mb-12">
            <div className="font-mono text-xs text-primary tracking-widest uppercase mb-4">{label}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {steps.map((step, idx) => {
                const Icon = icons[idx];

                return (
                  <button
                    key={`${key}-${step.label}`}
                    className="group relative h-24 bg-surface border border-border hover:border-primary transition-colors p-4 text-left overflow-hidden"
                  >
                    <div className="absolute right-2 top-2 text-border group-hover:text-primary/20 transition-colors">
                      <Icon />
                    </div>
                    <div className="relative z-10 flex flex-col justify-end h-full">
                      <div className="font-mono text-xs text-subtle mb-1 group-hover:text-primary">
                        0{idx + 1} {"//"}
                      </div>
                      <div className="font-bold text-text text-sm uppercase">{step.label}</div>
                      <div className="text-xs text-muted font-mono mt-0.5">{step.sub}</div>
                    </div>
                    <div className="absolute bottom-0 left-0 h-1 w-0 bg-primary group-hover:w-full transition-all duration-300" />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
