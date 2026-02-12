const LISTING_VARIANTS: Record<string, string> = {
  LIVE: "border-secondary/40 text-secondary bg-secondary/10",
  PENDING_APPROVAL: "border-warning/40 text-warning bg-warning/10",
  RESERVED: "border-primary/40 text-primary bg-primary/10",
  CONTACT_REVEALED: "border-primary/40 text-primary bg-primary/10",
  COMPLETED: "border-primary/40 text-primary bg-primary/10",
  DRAFT: "border-border-strong text-subtle bg-surface-alt",
  REMOVED: "border-error/40 text-error bg-error/10",
  EXPIRED: "border-border-strong text-subtle bg-surface-alt opacity-60",

  // Legacy display values (pre listing_status enum migration).
  ACTIVE: "border-secondary/40 text-secondary bg-secondary/10",
  SOLD: "border-primary/40 text-primary bg-primary/10",
};

const THREAD_VARIANTS: Record<string, string> = {
  OPEN: "border-secondary/40 text-secondary bg-secondary/10",
  CLOSED: "border-border-strong text-subtle bg-surface-alt",
};

const APPROVAL_VARIANTS: Record<string, string> = {
  PENDING: "border-warning/40 text-warning bg-warning/10",
  APPROVED: "border-secondary/40 text-secondary bg-secondary/10",
  DENIED: "border-error/40 text-error bg-error/10",
  EXPIRED: "border-border-strong text-subtle bg-surface-alt opacity-60",
  CANCELLED: "border-border-strong text-subtle bg-surface-alt opacity-60",
};

const AUDIT_VARIANTS: Record<string, string> = {
  SUCCESS: "border-secondary/40 text-secondary bg-secondary/10",
  EXECUTED: "border-secondary/40 text-secondary bg-secondary/10",
  STAGED: "border-warning/40 text-warning bg-warning/10",
  BLOCKED: "border-warning/40 text-warning bg-warning/10",
  FAILURE: "border-error/40 text-error bg-error/10",
  UNKNOWN: "border-border-strong text-subtle bg-surface-alt",
};

const CHANNEL_VARIANTS: Record<string, string> = {
  PENDING: "border-warning/40 text-warning bg-warning/10",
  ACTIVE: "border-secondary/40 text-secondary bg-secondary/10",
  REVOKED: "border-error/40 text-error bg-error/10",
};

const REPORT_VARIANTS: Record<string, string> = {
  UNCONFIRMED: "border-warning/40 text-warning bg-warning/10",
  CONFIRMED: "border-secondary/40 text-secondary bg-secondary/10",
  REJECTED: "border-error/40 text-error bg-error/10",
};

const VARIANT_MAPS: Record<string, Record<string, string>> = {
  listing: LISTING_VARIANTS,
  thread: THREAD_VARIANTS,
  approval: APPROVAL_VARIANTS,
  audit: AUDIT_VARIANTS,
  channel: CHANNEL_VARIANTS,
  report: REPORT_VARIANTS,
};

const FALLBACK = "border-border text-muted bg-surface-alt";

interface Props {
  value: string;
  variant?: "listing" | "thread" | "approval" | "audit" | "channel" | "report";
}

export default function ConsoleStatusBadge({ value, variant = "listing" }: Props) {
  const map = VARIANT_MAPS[variant] || LISTING_VARIANTS;
  const classes = map[value] || FALLBACK;
  return (
    <span className={`inline-block px-1.5 py-0.5 text-xs font-mono font-bold uppercase border rounded ${classes}`}>
      {value}
    </span>
  );
}
