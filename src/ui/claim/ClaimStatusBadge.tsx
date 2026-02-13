import type { ClaimLocale, ConnectSessionStatus } from "./types";

function badgeClass(status: ConnectSessionStatus | string) {
  switch (status) {
    case "PENDING_CLAIM":
      return "border-primary/40 text-primary bg-primary/10";
    case "CLAIMED":
      return "border-secondary/40 text-secondary bg-secondary/10";
    case "DELIVERED":
      return "border-secondary/40 text-secondary bg-secondary/10";
    case "EXPIRED":
      return "border-error/40 text-error bg-error/10";
    case "CANCELLED":
      return "border-border-strong text-subtle bg-surface-alt opacity-70";
    default:
      return "border-border text-subtle bg-surface/30";
  }
}

function statusLabel(status: ConnectSessionStatus | string, locale: ClaimLocale) {
  const value = String(status || "").toUpperCase();
  if (locale === "fr") {
    if (value === "PENDING_CLAIM") return "EN_ATTENTE";
    if (value === "CLAIMED") return "VALIDE";
    if (value === "DELIVERED") return "LIVRE";
    if (value === "EXPIRED") return "EXPIRE";
    if (value === "CANCELLED") return "ANNULE";
    return value || "\u2014";
  }
  return value || "\u2014";
}

export default function ClaimStatusBadge({
  status,
  locale = "en"
}: {
  status: ConnectSessionStatus | string;
  locale?: ClaimLocale;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-mono font-bold uppercase rounded border ${badgeClass(
        status
      )}`}
    >
      {statusLabel(status, locale)}
    </span>
  );
}
