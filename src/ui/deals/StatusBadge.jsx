const VARIANTS = {
  NEW: "border-secondary text-secondary",
  ACTIVE: "border-primary text-primary shadow-[0_0_8px_rgb(var(--theme-primary-rgb)/0.3)]",
  EXPIRED: "border-border-strong text-subtle line-through opacity-60"
};

export default function StatusBadge({ status }) {
  const classes = VARIANTS[status] || VARIANTS.NEW;
  return (
    <span
      data-testid="status-badge"
      className={`inline-block px-2 py-0.5 text-xs font-mono font-bold uppercase border rounded ${classes}`}
    >
      {status}
    </span>
  );
}
