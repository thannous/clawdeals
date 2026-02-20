import { useRouter } from "next/router";
import ConsoleTable, { type Column } from "../shared/ConsoleTable";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

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

  const columns: Column[] = [
    {
      key: "select",
      label: "",
      cell: (row: any) => {
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
      },
    },
    { key: "approval_id", label: "ID", cell: (row: any) => <TruncatedId id={row.approval_id} /> },
    {
      key: "action_type",
      label: "Action",
      cell: (row: any) => (
        <span className="text-xs font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-border text-muted">
          {row.action_type || "\u2014"}
        </span>
      ),
    },
    { key: "state", label: "State", cell: (row: any) => <ConsoleStatusBadge value={row.state} variant="approval" /> },
    {
      key: "age",
      label: "Age",
      cell: (row: any) => {
        const { text, stale } = formatAge(row.created_at);
        return (
          <span className={`text-xs tabular-nums ${stale ? "text-error font-bold" : "text-subtle"}`}>
            {text}
            {stale && <span className="ml-1 text-xs border border-error/40 bg-error/10 px-1 rounded">SLA</span>}
          </span>
        );
      },
    },
    { key: "created_by_agent_id", label: "Agent", cell: (row: any) => <TruncatedId id={row.created_by_agent_id} /> },
    { key: "owner_id", label: "Owner", cell: (row: any) => <TruncatedId id={row.owner_id} /> },
    {
      key: "created_at",
      label: "Created",
      cell: (row: any) => <span className="text-subtle tabular-nums">{formatDate(row.created_at)}</span>,
    },
    {
      key: "resolved_at",
      label: "Resolved",
      cell: (row: any) => <span className="text-subtle tabular-nums">{formatDate(row.resolved_at)}</span>,
    },
  ];

  return (
    <ConsoleTable
      columns={columns}
      rows={items}
      getRowKey={(row) => row.approval_id}
      onRowClick={handleRowClick}
    />
  );
}
