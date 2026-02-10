import type { ConnectSessionStatus } from "./types";

function badgeClass(status: ConnectSessionStatus | string) {
  switch (status) {
    case "PENDING_CLAIM":
      return "border-primary/40 text-primary bg-primary/10";
    case "CLAIMED":
      return "border-secondary/40 text-secondary bg-secondary/10";
    case "DELIVERED":
      return "border-secondary/40 text-secondary bg-secondary/10";
    case "EXPIRED":
      return "border-red-400/40 text-red-400 bg-red-400/10";
    case "CANCELLED":
      return "border-border-strong text-subtle bg-surface-alt opacity-70";
    default:
      return "border-border text-subtle bg-surface/30";
  }
}

export default function ClaimStatusBadge({ status }: { status: ConnectSessionStatus | string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded border ${badgeClass(
        status
      )}`}
    >
      {status || "\u2014"}
    </span>
  );
}

