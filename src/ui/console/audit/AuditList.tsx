import ConsoleTable, { type Column } from "../shared/ConsoleTable";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

const COLUMNS: Column[] = [
  { key: "audit_id", label: "ID" },
  { key: "ts", label: "Timestamp" },
  { key: "actor_type", label: "Actor" },
  { key: "actor_id", label: "Actor ID" },
  { key: "action", label: "Action" },
  { key: "outcome", label: "Outcome" },
  { key: "request_id", label: "Request ID" },
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

  const renderCell = (row: any, col: Column) => {
    switch (col.key) {
      case "audit_id":
        return <TruncatedId id={row.audit_id} />;
      case "ts":
        return <span className="text-subtle tabular-nums">{formatDate(row.ts)}</span>;
      case "actor_type":
        return (
          <span
            className={`inline-block px-1.5 py-0.5 text-xs font-mono font-bold uppercase border border-border rounded ${
              ACTOR_TYPE_COLORS[row.actor?.type] || "text-muted"
            }`}
          >
            {row.actor?.type || "\u2014"}
          </span>
        );
      case "actor_id":
        return <TruncatedId id={row.actor?.id} />;
      case "action":
        return <span className="text-text">{row.action}</span>;
      case "outcome":
        return <ConsoleStatusBadge value={row.outcome} variant="audit" />;
      case "request_id":
        return <TruncatedId id={row.request_id} />;
      default:
        return row[col.key] ?? "\u2014";
    }
  };

  return (
    <ConsoleTable
      columns={COLUMNS}
      rows={items}
      getRowKey={(row) => row.audit_id}
      onRowClick={handleRowClick}
      renderCell={renderCell}
    />
  );
}
