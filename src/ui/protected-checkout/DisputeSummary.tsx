import { useTranslations } from "next-intl";
import { formatDate } from "../console/shared/formatDate";
import { Badge, Field } from "./Section";

const REASONS = ["item_not_received", "not_as_described", "fraud_suspected", "other"];
const PARTIES = ["BUYER", "SELLER", "OPS", "SYSTEM"];

// Who opened the dispute, why, what was decided, and each side's statement.
export default function DisputeSummary({ dispute }: { dispute: any }) {
  const t = useTranslations("protectedCheckout");
  const party = (value: string) => (PARTIES.includes(value) ? t(`dispute.party.${value}`) : value);
  const resolved = dispute.status === "RESOLVED";
  const statements = Array.isArray(dispute.statements) ? dispute.statements : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span data-testid="pc-dispute-status">
          <Badge tone={resolved ? "ok" : "warn"}>{t(`dispute.status.${dispute.status}`)}</Badge>
        </span>
        {resolved && (
          <span data-testid="pc-dispute-resolution">
            <Badge tone="info">{t(`dispute.resolution.${dispute.resolution}`)}</Badge>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t("dispute.openedBy")}>{party(dispute.opened_by)}</Field>
        <Field label={t("dispute.reason")}>
          {REASONS.includes(dispute.reason_code) ? t(`reasons.${dispute.reason_code}`) : dispute.reason_code}
        </Field>
        <Field label={t("dispute.openedAt")}>{formatDate(dispute.opened_at)}</Field>
        {resolved && <Field label={t("dispute.decision")}>{t(`dispute.resolution.${dispute.resolution}`)}</Field>}
      </div>

      {dispute.opened_notes && (
        <div>
          <p className="text-xs font-mono text-subtle uppercase tracking-wider mb-1">{t("dispute.openingNote")}</p>
          <p className="text-sm text-text whitespace-pre-line [overflow-wrap:anywhere]">{dispute.opened_notes}</p>
        </div>
      )}

      {resolved && dispute.resolution_notes && (
        <div>
          <p className="text-xs font-mono text-subtle uppercase tracking-wider mb-1">{t("dispute.decisionNote")}</p>
          <p className="text-sm text-text whitespace-pre-line [overflow-wrap:anywhere]">{dispute.resolution_notes}</p>
        </div>
      )}

      <div>
        <p className="text-xs font-mono text-subtle uppercase tracking-wider mb-2">{t("dispute.statements")}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {["BUYER", "SELLER"].map((side) => {
            const statement = statements.find((row: any) => row.submitted_by === side);
            return (
              <div key={side} data-testid={`pc-statement-${side.toLowerCase()}`} className="border border-border bg-bg rounded clip-corner p-3">
                <p className="text-xs font-mono font-bold text-muted uppercase tracking-wider">{party(side)}</p>
                {statement ? (
                  <>
                    <p className="mt-2 text-sm text-text whitespace-pre-line [overflow-wrap:anywhere]">{statement.body}</p>
                    <p className="mt-2 text-xs font-mono text-subtle">{formatDate(statement.updated_at)}</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-subtle">{t("dispute.noStatement")}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
