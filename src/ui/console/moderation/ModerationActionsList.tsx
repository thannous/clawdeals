import ConsoleTable, { type Column } from "../shared/ConsoleTable";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

const COLUMNS: Column[] = [
  {
    key: "action_type",
    label: "Action",
    cell: (row: any) => (
      <span className="text-xs font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-border text-muted">
        {row.action_type || "\u2014"}
      </span>
    ),
  },
  {
    key: "entity_type",
    label: "Entity Type",
    cell: (row: any) => <span className="text-xs font-mono uppercase text-subtle">{row.entity_type || "\u2014"}</span>,
  },
  { key: "entity_id", label: "Entity", cell: (row: any) => <TruncatedId id={row.entity_id} /> },
  { key: "performed_by", label: "Performed By", cell: (row: any) => <TruncatedId id={row.performed_by} /> },
  {
    key: "reason",
    label: "Reason",
    cell: (row: any) => (
      <span className="text-xs font-mono text-muted max-w-[200px] truncate inline-block" title={row.reason || ""}>
        {row.reason || "\u2014"}
      </span>
    ),
  },
  { key: "created_at", label: "When", cell: (row: any) => <span className="text-subtle tabular-nums">{formatDate(row.created_at)}</span> },
];

interface Props {
  items: any[];
}

export default function ModerationActionsList({ items }: Props) {
  return (
    <ConsoleTable
      columns={COLUMNS}
      rows={items}
      getRowKey={(row) => row.action_id}
    />
  );
}
