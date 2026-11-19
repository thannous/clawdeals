import type { ReactNode } from "react";

export function Section({ title, testId, children }: { title: string; testId?: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className="border border-border bg-surface rounded clip-corner p-5 space-y-4">
      <h2 className="text-xs font-mono font-bold text-muted uppercase tracking-widest">{title}</h2>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-start justify-between gap-3 text-xs font-mono">
      <span className="text-subtle uppercase tracking-wider shrink-0">{label}</span>
      <span className="text-text text-right [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

const TONES: Record<string, string> = {
  neutral: "border-border text-muted bg-surface-alt",
  info: "border-primary/40 text-primary bg-primary/10",
  ok: "border-secondary/40 text-secondary bg-secondary/10",
  warn: "border-warning/40 text-warning bg-warning/10",
  bad: "border-error/40 text-error bg-error/10"
};

export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 text-xs font-mono font-bold uppercase border rounded ${TONES[tone] || TONES.neutral}`}>
      {children}
    </span>
  );
}

export function escrowStatusTone(status: string): Tone {
  if (status === "DISPUTE_OPEN") return "warn";
  if (status === "RELEASED" || status === "REFUNDED") return "ok";
  if (status === "FAILED" || status === "CANCELLED") return "bad";
  if (status === "DELIVERED" || status === "HOLD") return "info";
  return "neutral";
}

export function shipmentStatusTone(status: string): Tone {
  if (status === "DELIVERED") return "ok";
  if (status === "EXCEPTION") return "bad";
  if (status === "IN_TRANSIT") return "info";
  return "neutral";
}
