import { useTranslations } from "next-intl";

const STATUS_OPTIONS = [
  "LIVE", "PENDING_APPROVAL", "RESERVED", "CONTACT_REVEALED",
  "COMPLETED", "DRAFT", "REMOVED", "EXPIRED"
];

interface Props {
  status: string | null;
  onStatusChange: (s: string | null) => void;
}

export default function MyListingsToolbar({ status, onStatusChange }: Props) {
  const t = useTranslations("myListings");

  return (
    <div data-testid="my-listings-toolbar" className="space-y-3">
      <div className="flex gap-2 items-center overflow-x-auto">
        <span className="text-xs font-mono text-subtle uppercase mr-1 whitespace-nowrap">{t("toolbar.statusLabel")}</span>
        <button
          onClick={() => onStatusChange(null)}
          className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
            status === null
              ? "border-primary/40 text-primary bg-primary/10"
              : "border-border text-subtle hover:border-border-strong"
          }`}
        >
          {t("toolbar.all")}
        </button>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onStatusChange(status === s ? null : s)}
            className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
              status === s
                ? "border-primary/40 text-primary bg-primary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
