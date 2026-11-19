import { useTranslations } from "next-intl";
import { formatDate } from "../console/shared/formatDate";
import { Section } from "./Section";
import { splitTimeLeft, useNow } from "./useNow";

// Where the buyer's inspection window stands for this escrow.
export default function InspectionNotice({ inspection, escrowStatus }: { inspection: any; escrowStatus: string }) {
  const t = useTranslations("protectedCheckout");
  const now = useNow();
  const left = splitTimeLeft(inspection?.ends_at, now);

  let state: "notStarted" | "open" | "ended" | "paused" | "closed" = "closed";
  if (escrowStatus === "DISPUTE_OPEN") state = "paused";
  else if (escrowStatus === "DELIVERED" && inspection?.ends_at) state = left?.over ?? !inspection.open ? "ended" : "open";
  else if (escrowStatus === "CREATED" || escrowStatus === "HOLD") state = "notStarted";

  const tone =
    state === "open"
      ? "border-primary/40 bg-primary/5"
      : state === "paused"
        ? "border-warning/40 bg-warning/5"
        : "border-border bg-bg";

  return (
    <Section title={t("inspection.title")} testId="pc-inspection">
      <p data-testid="pc-inspection-state" data-state={state} className={`border rounded clip-corner px-3 py-2 text-sm text-text ${tone}`}>
        {state === "notStarted" && t("inspection.notStarted", { hours: inspection?.window_hours ?? 48 })}
        {state === "open" &&
          t("inspection.open", {
            date: formatDate(inspection.ends_at),
            left: left ? t("inspection.timeLeft", { hours: left.hours, minutes: left.minutes }) : "\u2026"
          })}
        {state === "ended" && t("inspection.ended", { date: formatDate(inspection.ends_at) })}
        {state === "paused" && t("inspection.paused")}
        {state === "closed" && t("inspection.closed")}
      </p>
    </Section>
  );
}
