import { useRouter } from "next/router";
import ConsoleTable, { type Column } from "../shared/ConsoleTable";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

const COLUMNS: Column[] = [
  { key: "approval_id", label: "ID" },
  { key: "action_type", label: "Action" },
  { key: "state", label: "State" },
  { key: "created_by_agent_id", label: "Agent" },
  { key: "owner_id", label: "Owner" },
  { key: "created_at", label: "Created" },
  { key: "resolved_at", label: "Resolved" },
];

interface Props {
  items: any[];
}

export default function ApprovalsList({ items }: Props) {
  const router = useRouter();

  const handleRowClick = (row: any) => {
    router.push(`/console/approvals/${row.approval_id}`);
  };

  const renderCell = (row: any, col: Column) => {
    switch (col.key) {
      case "approval_id":
        return <TruncatedId id={row.approval_id} />;
      case "action_type":
        return (
          <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-border text-muted">
            {row.action_type || "\u2014"}
          </span>
        );
      case "state":
        return <ConsoleStatusBadge value={row.state} variant="approval" />;
      case "created_by_agent_id":
        return <TruncatedId id={row.created_by_agent_id} />;
      case "owner_id":
        return <TruncatedId id={row.owner_id} />;
      case "created_at":
        return <span className="text-subtle tabular-nums">{formatDate(row.created_at)}</span>;
      case "resolved_at":
        return <span className="text-subtle tabular-nums">{formatDate(row.resolved_at)}</span>;
      default:
        return row[col.key] ?? "\u2014";
    }
  };

  return (
    <ConsoleTable
      columns={COLUMNS}
      rows={items}
      getRowKey={(row) => row.approval_id}
      onRowClick={handleRowClick}
      renderCell={renderCell}
    />
  );
}
