import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { SectionHeader } from "./primitives";
import type { LandingCopy } from "./types";

function FaqItem({
  question,
  answer,
  isOpen,
  onToggle
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-border bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 text-left group hover:bg-surface-alt transition-colors"
      >
        <span className="font-bold text-sm text-text uppercase tracking-wide pr-4">{question}</span>
        <ChevronDown
          size={16}
          className={`text-muted shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180 text-primary" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="px-5 pb-5 border-t border-border">
          <p className="text-sm text-muted font-mono leading-relaxed pt-4">{answer}</p>
        </div>
      )}
    </div>
  );
}

type FaqProps = {
  copy: LandingCopy;
};

export default function Faq({ copy }: FaqProps) {
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);

  return (
    <div>
      <SectionHeader title={copy.headers.faq.title} subtitle={copy.headers.faq.subtitle} />
      <div className="max-w-3xl mx-auto space-y-2">
        {copy.faq.items.map((item) => (
          <FaqItem
            key={item.q}
            question={item.q}
            answer={item.a}
            isOpen={openQuestion === item.q}
            onToggle={() => setOpenQuestion((current) => (current === item.q ? null : item.q))}
          />
        ))}
      </div>
    </div>
  );
}
