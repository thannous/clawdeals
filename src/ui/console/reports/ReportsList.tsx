import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

interface Props {
  items: any[];
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onToggleSelectAll: () => void;
  onRowClick: (report: any) => void;
}

export default function ReportsList({
  items,
  selectedIds,
  onToggleSelection,
  onToggleSelectAll,
  onRowClick,
}: Props) {
  const allSelected = items.length > 0 && items.every((r) => selectedIds.has(r.report_id));

  return (
    <div className="bg-surface border border-border overflow-hidden overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-bg/60 border-b border-border">
            <th className="text-xs font-mono font-bold text-subtle uppercase tracking-wider px-3 py-2 text-left w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="accent-primary"
              />
            </th>
            <th className="text-xs font-mono font-bold text-subtle uppercase tracking-wider px-3 py-2 text-left">ID</th>
            <th className="text-xs font-mono font-bold text-subtle uppercase tracking-wider px-3 py-2 text-left">Entity Type</th>
            <th className="text-xs font-mono font-bold text-subtle uppercase tracking-wider px-3 py-2 text-left">Entity ID</th>
            <th className="text-xs font-mono font-bold text-subtle uppercase tracking-wider px-3 py-2 text-left">Reporter</th>
            <th className="text-xs font-mono font-bold text-subtle uppercase tracking-wider px-3 py-2 text-left">Reason</th>
            <th className="text-xs font-mono font-bold text-subtle uppercase tracking-wider px-3 py-2 text-left">Weight</th>
            <th className="text-xs font-mono font-bold text-subtle uppercase tracking-wider px-3 py-2 text-left">Status</th>
            <th className="text-xs font-mono font-bold text-subtle uppercase tracking-wider px-3 py-2 text-left">Created</th>
            <th className="text-xs font-mono font-bold text-subtle uppercase tracking-wider px-3 py-2 text-left">Resolved By</th>
            <th className="text-xs font-mono font-bold text-subtle uppercase tracking-wider px-3 py-2 text-left">Resolved At</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr
              key={row.report_id}
              onClick={() => onRowClick(row)}
              className="border-b border-border/50 hover:bg-surface-alt/50 transition-colors cursor-pointer"
            >
              <td className="text-xs font-mono text-text px-3 py-2.5 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={selectedIds.has(row.report_id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleSelection(row.report_id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="accent-primary"
                />
              </td>
              <td className="text-xs font-mono text-text px-3 py-2.5 whitespace-nowrap">
                <TruncatedId id={row.report_id} />
              </td>
              <td className="text-xs font-mono text-text px-3 py-2.5 whitespace-nowrap">
                <span className="text-xs font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-border text-muted">
                  {row.entity_type || "\u2014"}
                </span>
              </td>
              <td className="text-xs font-mono text-text px-3 py-2.5 whitespace-nowrap">
                <TruncatedId id={row.entity_id} />
              </td>
              <td className="text-xs font-mono text-text px-3 py-2.5 whitespace-nowrap">
                <TruncatedId id={row.reporter_owner_id} />
              </td>
              <td className="text-xs font-mono text-text px-3 py-2.5 whitespace-nowrap">
                <span className="text-xs font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-border text-muted">
                  {row.reason_code || "\u2014"}
                </span>
              </td>
              <td className="text-xs font-mono text-text px-3 py-2.5 whitespace-nowrap tabular-nums">
                {row.report_weight ?? "\u2014"}
              </td>
              <td className="text-xs font-mono text-text px-3 py-2.5 whitespace-nowrap">
                <ConsoleStatusBadge value={row.status} variant="report" />
              </td>
              <td className="text-xs font-mono text-text px-3 py-2.5 whitespace-nowrap">
                <span className="text-subtle tabular-nums">{formatDate(row.created_at)}</span>
              </td>
              <td className="text-xs font-mono text-text px-3 py-2.5 whitespace-nowrap">
                <TruncatedId id={row.resolved_by} />
              </td>
              <td className="text-xs font-mono text-text px-3 py-2.5 whitespace-nowrap">
                <span className="text-subtle tabular-nums">{formatDate(row.resolved_at)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
