import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { formatDate } from "../console/shared/formatDate";
import { Badge, Field, Section, shipmentStatusTone } from "./Section";

const KNOWN_CARRIERS = ["colissimo", "mondial_relay", "chronopost", "royal_mail", "correos", "dhl", "ups", "other"];
const KNOWN_STATUSES = ["REGISTERED", "IN_TRANSIT", "DELIVERED", "EXCEPTION"];

// Carrier facts about the parcel. Deliberately silent about its contents.
export default function TrackingCard({ shipment, children }: { shipment: any; children?: ReactNode }) {
  const t = useTranslations("protectedCheckout");
  const statusLabel = (status: string) => (KNOWN_STATUSES.includes(status) ? t(`tracking.status.${status}`) : status);

  return (
    <Section title={t("tracking.title")} testId="pc-tracking">
      {!shipment ? (
        <p className="text-sm text-subtle">{t("tracking.none")}</p>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <span data-testid="pc-tracking-status">
              <Badge tone={shipmentStatusTone(shipment.status)}>{statusLabel(shipment.status)}</Badge>
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t("tracking.carrier")}>
              {KNOWN_CARRIERS.includes(shipment.carrier) ? t(`tracking.carriers.${shipment.carrier}`) : shipment.carrier}
            </Field>
            <Field label={t("tracking.number")}>{shipment.tracking_number}</Field>
          </div>

          {(shipment.events || []).length === 0 ? (
            <p className="text-sm text-subtle">{t("tracking.noEvents")}</p>
          ) : (
            <ol data-testid="pc-tracking-events" className="space-y-2">
              {shipment.events.map((event: any) => (
                <li
                  key={event.tracking_event_id}
                  className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3 text-xs font-mono"
                >
                  <span className="text-text">
                    {statusLabel(event.status)}
                    {event.location ? <span className="text-subtle"> · {event.location}</span> : null}
                  </span>
                  <span className="text-subtle tabular-nums">{formatDate(event.occurred_at)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="text-sm text-muted">{t("tracking.note")}</p>
        </>
      )}
      {children}
    </Section>
  );
}
