import type { DeviceAuthorizationStatus } from "./types";

function badgeClass(status: DeviceAuthorizationStatus | string) {
  switch (status) {
    case "PENDING":
      return "border-primary/40 text-primary bg-primary/10";
    case "AUTHORIZED":
      return "border-secondary/40 text-secondary bg-secondary/10";
    case "DENIED":
      return "border-red-400/40 text-red-400 bg-red-400/10";
    case "EXPIRED":
      return "border-red-400/40 text-red-400 bg-red-400/10";
    default:
      return "border-border text-subtle bg-surface/30";
  }
}

export default function DeviceStatusBadge({ status }: { status: DeviceAuthorizationStatus | string }) {
  return (
    <span
      data-testid="device-status"
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded border ${badgeClass(
        status
      )}`}
    >
      {status || "\u2014"}
    </span>
  );
}

