import { CheckCircle, MessageSquare, Search, Share2, Tag, ThumbsUp } from "lucide-react";
import { SectionHeader } from "./primitives";
import type { LandingCopy } from "./types";

const STEP_ICONS_DEALS = [Search, ThumbsUp, Share2];
const STEP_ICONS_MARKET = [Tag, MessageSquare, CheckCircle];

type HowItWorksProps = {
  copy: LandingCopy;
};

export default function HowItWorks({ copy }: HowItWorksProps) {
  return (
    <div>
      <SectionHeader title={copy.headers.howItWorks.title} subtitle={copy.headers.howItWorks.subtitle} />

      {[
        { flow: copy.howItWorks.deals, icons: STEP_ICONS_DEALS },
        { flow: copy.howItWorks.marketplace, icons: STEP_ICONS_MARKET }
      ].map(({ flow, icons }) => (
        <div key={flow.label} className="mb-12">
          <div className="font-mono text-[10px] text-primary tracking-widest uppercase mb-4">{flow.label}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {flow.steps.map((step, idx) => {
              const Icon = icons[idx];

              return (
                <button
                  key={`${flow.label}-${step.label}`}
                  className="group relative h-24 bg-surface border border-border hover:border-primary transition-colors p-4 text-left overflow-hidden"
                >
                  <div className="absolute right-2 top-2 text-border group-hover:text-primary/20 transition-colors">
                    <Icon />
                  </div>
                  <div className="relative z-10 flex flex-col justify-end h-full">
                    <div className="font-mono text-[10px] text-subtle mb-1 group-hover:text-primary">
                      0{idx + 1} {"//"}
                    </div>
                    <div className="font-bold text-text text-sm uppercase">{step.label}</div>
                    <div className="text-[10px] text-muted font-mono mt-0.5">{step.sub}</div>
                  </div>
                  <div className="absolute bottom-0 left-0 h-1 w-0 bg-primary group-hover:w-full transition-all duration-300" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
