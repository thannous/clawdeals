import ConsoleTable, { type Column } from "../shared/ConsoleTable";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

const COLUMNS: Column[] = [
  { key: "audit_id", label: "ID", cell: (row: any) => <TruncatedId id={row.audit_id} /> },
  { key: "ts", label: "Timestamp", cell: (row: any) => <span className="text-subtle tabular-nums">{formatDate(row.ts)}</span> },
  {
    key: "actor_type",
    label: "Actor",
    cell: (row: any) => (
      <span
        className={`inline-block px-1.5 py-0.5 text-xs font-mono font-bold uppercase border border-border rounded ${
          ACTOR_TYPE_COLORS[row.actor?.type] || "text-muted"
        }`}
      >
        {row.actor?.type || "\u2014"}
      </span>
    ),
  },
  { key: "actor_id", label: "Actor ID", cell: (row: any) => <TruncatedId id={row.actor?.id} /> },
  { key: "action", label: "Action", cell: (row: any) => <span className="text-text">{row.action}</span> },
  { key: "outcome", label: "Outcome", cell: (row: any) => <ConsoleStatusBadge value={row.outcome} variant="audit" /> },
  { key: "request_id", label: "Request ID", cell: (row: any) => <TruncatedId id={row.request_id} /> },
];

const ACTOR_TYPE_COLORS: Record<string, string> = {
  agent: "text-primary",
  owner: "text-secondary",
  human: "text-secondary",
  anonymous: "text-subtle",
  system: "text-muted",
};

interface Props {
  items: any[];
  onSelect: (row: any) => void;
}

export default function AuditList({ items, onSelect }: Props) {
  const handleRowClick = (row: any) => {
    onSelect(row);
  };

  return (
    <ConsoleTable
      columns={COLUMNS}
      rows={items}
      getRowKey={(row) => row.audit_id}
      onRowClick={handleRowClick}
    />
  );
}
