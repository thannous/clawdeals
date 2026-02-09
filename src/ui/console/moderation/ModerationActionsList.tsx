import ConsoleTable, { type Column } from "../shared/ConsoleTable";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

const COLUMNS: Column[] = [
  { key: "action_type", label: "Action" },
  { key: "entity_type", label: "Entity Type" },
  { key: "entity_id", label: "Entity" },
  { key: "performed_by", label: "Performed By" },
  { key: "reason", label: "Reason" },
  { key: "created_at", label: "When" },
];

interface Props {
  items: any[];
}

export default function ModerationActionsList({ items }: Props) {
  const renderCell = (row: any, col: Column) => {
    switch (col.key) {
      case "action_type":
        return (
          <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-border text-muted">
            {row.action_type || "\u2014"}
          </span>
        );
      case "entity_type":
        return (
          <span className="text-[10px] font-mono uppercase text-subtle">
            {row.entity_type || "\u2014"}
          </span>
        );
      case "entity_id":
        return <TruncatedId id={row.entity_id} />;
      case "performed_by":
        return <TruncatedId id={row.performed_by} />;
      case "reason":
        return (
          <span className="text-xs font-mono text-muted max-w-[200px] truncate inline-block" title={row.reason || ""}>
            {row.reason || "\u2014"}
          </span>
        );
      case "created_at":
        return <span className="text-subtle tabular-nums">{formatDate(row.created_at)}</span>;
      default:
        return row[col.key] ?? "\u2014";
    }
  };

  return (
    <ConsoleTable
      columns={COLUMNS}
      rows={items}
      getRowKey={(row) => row.action_id}
      renderCell={renderCell}
    />
  );
}
