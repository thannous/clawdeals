import { useTranslations } from "next-intl";

const STATUS_OPTIONS = ["OPEN", "CLOSED"];

interface Props {
  status: string | null;
  onStatusChange: (s: string | null) => void;
}

export default function MyThreadsToolbar({ status, onStatusChange }: Props) {
  const t = useTranslations("myThreads");

  return (
    <div data-testid="my-threads-toolbar" className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-mono text-subtle uppercase mr-1">{t("toolbar.statusLabel")}</span>
        <button
          onClick={() => onStatusChange(null)}
          className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
            !status
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
