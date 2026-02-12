import { useRouter } from "next/router";
import ConsoleTable, { type Column } from "../shared/ConsoleTable";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

const COLUMNS: Column[] = [
  { key: "select", label: "" },
  { key: "approval_id", label: "ID" },
  { key: "action_type", label: "Action" },
  { key: "state", label: "State" },
  { key: "age", label: "Age" },
  { key: "created_by_agent_id", label: "Agent" },
  { key: "owner_id", label: "Owner" },
  { key: "created_at", label: "Created" },
  { key: "resolved_at", label: "Resolved" },
];

function formatAge(createdAt: string | null | undefined): { text: string; stale: boolean } {
  if (!createdAt) return { text: "\u2014", stale: false };
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const slaHours = 24;
  const stale = hours >= slaHours;
  if (days > 0) return { text: `${days}d ${hours % 24}h`, stale };
  if (hours > 0) return { text: `${hours}h`, stale };
  const mins = Math.floor(diffMs / (1000 * 60));
  return { text: `${mins}m`, stale: false };
}

interface Props {
  items: any[];
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
}

export default function ApprovalsList({ items, selectedIds, onToggle, onToggleAll }: Props) {
  const router = useRouter();

  const handleRowClick = (row: any) => {
    router.push(`/console/approvals/${row.approval_id}`);
  };

  const renderCell = (row: any, col: Column) => {
    switch (col.key) {
      case "select":
        if (row.state !== "PENDING" || !onToggle) return null;
        return (
          <input
            type="checkbox"
            checked={selectedIds?.has(row.approval_id) || false}
            onChange={(e) => {
              e.stopPropagation();
              onToggle(row.approval_id);
            }}
            onClick={(e) => e.stopPropagation()}
            className="accent-primary"
          />
        );
      case "approval_id":
        return <TruncatedId id={row.approval_id} />;
      case "action_type":
        return (
          <span className="text-xs font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-border text-muted">
            {row.action_type || "\u2014"}
          </span>
        );
      case "state":
        return <ConsoleStatusBadge value={row.state} variant="approval" />;
      case "age": {
        const { text, stale } = formatAge(row.created_at);
        return (
          <span className={`text-xs tabular-nums ${stale ? "text-red-400 font-bold" : "text-subtle"}`}>
            {text}
            {stale && <span className="ml-1 text-xs border border-red-400/40 bg-red-400/10 px-1 rounded">SLA</span>}
          </span>
        );
      }
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
