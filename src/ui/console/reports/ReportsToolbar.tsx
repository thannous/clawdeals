import {
  REPORT_ENTITY_TYPE_VALUES,
  REPORT_REASON_CODE_VALUES,
  REPORT_STATUS_VALUES
} from "../../../shared/reports";

const STATUS_OPTIONS = REPORT_STATUS_VALUES;
const ENTITY_TYPE_OPTIONS = REPORT_ENTITY_TYPE_VALUES;
const REASON_CODE_OPTIONS = REPORT_REASON_CODE_VALUES;

interface Props {
  status: string;
  onStatusChange: (s: string) => void;
  entityType: string | null;
  onEntityTypeChange: (t: string | null) => void;
  reasonCode: string | null;
  onReasonCodeChange: (r: string | null) => void;
  reporterOwnerId: string;
  onReporterOwnerIdChange: (v: string) => void;
}

export default function ReportsToolbar({
  status, onStatusChange,
  entityType, onEntityTypeChange,
  reasonCode, onReasonCodeChange,
  reporterOwnerId, onReporterOwnerIdChange,
}: Props) {
  return (
    <div data-testid="reports-toolbar" className="space-y-3">
      {/* Status pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-mono text-subtle uppercase mr-1">Status:</span>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onStatusChange(s)}
            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
              status === s
                ? "border-primary/40 text-primary bg-primary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Entity type pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-mono text-subtle uppercase mr-1">Entity:</span>
        <button
          onClick={() => onEntityTypeChange(null)}
          className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
            entityType === null
              ? "border-secondary/40 text-secondary bg-secondary/10"
              : "border-border text-subtle hover:border-border-strong"
          }`}
        >
          All
        </button>
        {ENTITY_TYPE_OPTIONS.map((t) => (
          <button
            key={t}
            onClick={() => onEntityTypeChange(entityType === t ? null : t)}
            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
              entityType === t
                ? "border-secondary/40 text-secondary bg-secondary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Reason code pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-mono text-subtle uppercase mr-1">Reason:</span>
        <button
          onClick={() => onReasonCodeChange(null)}
          className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
            reasonCode === null
              ? "border-secondary/40 text-secondary bg-secondary/10"
              : "border-border text-subtle hover:border-border-strong"
          }`}
        >
          All
        </button>
        {REASON_CODE_OPTIONS.map((r) => (
          <button
            key={r}
            onClick={() => onReasonCodeChange(reasonCode === r ? null : r)}
            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-all ${
              reasonCode === r
                ? "border-secondary/40 text-secondary bg-secondary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Reporter owner ID input */}
      <div className="max-w-sm">
        <label className="block text-[10px] font-mono text-subtle uppercase mb-1">Reporter Owner ID</label>
        <input
          data-testid="reports-reporter-owner-id"
          type="text"
          value={reporterOwnerId}
          onChange={(e) => onReporterOwnerIdChange(e.target.value)}
          placeholder="Filter by reporter owner UUID..."
          className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:outline-none focus:border-primary transition-colors"
        />
      </div>
    </div>
  );
}
