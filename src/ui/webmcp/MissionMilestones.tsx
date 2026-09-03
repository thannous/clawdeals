import { useMemo } from "react";
import { CheckCircle2, Circle, ShieldAlert, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { deriveMilestones, type Milestone } from "../../webmcp/activity/derive";
import { useWebMcpReceipts } from "./useWebMcpReceipts";

const GUARD_MILESTONES = new Set<Milestone["id"]>(["policy_stop", "human_approval", "consent_pending"]);

function formatTime(value: string | null, locale: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function MilestoneRow({ milestone, index }: { milestone: Milestone; index: number }) {
  const t = useTranslations("webmcp");
  const locale = useLocale();
  const done = milestone.state === "done";
  const guard = GUARD_MILESTONES.has(milestone.id);
  const Icon = done ? (guard ? ShieldCheck : CheckCircle2) : guard ? ShieldAlert : Circle;
  const tone = done
    ? guard
      ? "text-secondary"
      : "text-success"
    : "text-subtle";

  return (
    <li
      data-testid="mission-milestone"
      data-milestone-id={milestone.id}
      data-state={milestone.state}
      className={`flex items-start gap-3 py-2 ${done ? "" : "opacity-70"}`}
    >
      <span className={`mt-0.5 shrink-0 ${tone}`} aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className={`text-sm font-semibold ${done ? "text-text" : "text-muted"}`}>
            <span className="mr-2 font-mono text-[10px] text-subtle">{String(index + 1).padStart(2, "0")}</span>
            {t(milestone.labelKey)}
          </p>
          {done ? (
            <span className="font-mono text-[10px] text-subtle" title={milestone.requestId || undefined}>
              {formatTime(milestone.timestamp, locale)}
              {milestone.requestId ? ` · ${milestone.requestId.slice(0, 8)}` : ""}
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-wider text-subtle">{t("common.pending")}</span>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{t(milestone.detailKey)}</p>
      </div>
    </li>
  );
}

export default function MissionMilestones({ title }: { title?: string }) {
  const t = useTranslations("webmcp");
  const resolvedTitle = title || t("milestones.title");
  const receipts = useWebMcpReceipts();
  const milestones = useMemo(() => deriveMilestones(receipts), [receipts]);
  const doneCount = milestones.filter((entry) => entry.state === "done").length;

  return (
    <section
      data-testid="mission-milestones"
      aria-label={resolvedTitle}
      className="border border-border bg-surface rounded clip-corner p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">{t("milestones.eyebrow")}</p>
          <h2 className="mt-1 text-lg font-bold uppercase tracking-wide text-text">{resolvedTitle}</h2>
        </div>
        <span
          data-testid="mission-milestones-progress"
          className="border border-border px-2.5 py-1 font-mono text-[11px] text-muted"
        >
          {t("milestones.progress", { done: doneCount, total: milestones.length })}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        {t("milestones.description")}
      </p>
      <ol className="mt-3 divide-y divide-border">
        {milestones.map((milestone, index) => (
          <MilestoneRow key={milestone.id} milestone={milestone} index={index} />
        ))}
      </ol>
    </section>
  );
}
