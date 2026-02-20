import ConsoleTable, { type Column } from "../shared/ConsoleTable";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

interface Props {
  items: any[];
  onApprove: (identity: any) => void;
  onDeny: (identity: any) => void;
  onRevoke: (identity: any) => void;
}

export default function ChannelsList({ items, onApprove, onDeny, onRevoke }: Props) {
  const columns: Column[] = [
    { key: "channel_identity_id", label: "ID", cell: (row: any) => <TruncatedId id={row.channel_identity_id} /> },
    { key: "channel_type", label: "Channel", cell: (row: any) => <span className="text-text">{row.channel_type || "\u2014"}</span> },
    {
      key: "state",
      label: "State",
      cell: (row: any) => <ConsoleStatusBadge value={row.state || "\u2014"} variant="channel" />,
    },
    {
      key: "role",
      label: "Role",
      cell: (row: any) => (
        <span className="inline-block px-1.5 py-0.5 text-xs font-mono font-bold uppercase border border-border rounded text-muted">
          {row.role || "\u2014"}
        </span>
      ),
    },
    { key: "display_name", label: "Display", cell: (row: any) => <span className="text-subtle">{row.display_name || "\u2014"}</span> },
    {
      key: "pairing_expires_at",
      label: "Expires",
      cell: (row: any) => <span className="text-subtle tabular-nums">{formatDate(row.pairing_expires_at)}</span>,
    },
    {
      key: "last_seen_at",
      label: "Last seen",
      cell: (row: any) => <span className="text-subtle tabular-nums">{formatDate(row.last_seen_at)}</span>,
    },
    {
      key: "actions",
      label: "Actions",
      cell: (row: any) => {
        if (row.state === "PENDING") {
          return (
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove(row);
                }}
                className="px-2 py-1 text-xs font-mono font-bold uppercase border border-secondary/40 text-secondary rounded hover:bg-secondary/10 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeny(row);
                }}
                className="px-2 py-1 text-xs font-mono font-bold uppercase border border-error/40 text-error rounded hover:bg-error/10 transition-colors"
              >
                Deny
              </button>
            </div>
          );
        }
        if (row.state === "ACTIVE") {
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRevoke(row);
              }}
              className="px-2 py-1 text-xs font-mono font-bold uppercase border border-error/40 text-error rounded hover:bg-error/10 transition-colors"
            >
              Revoke
            </button>
          );
        }
        return <span className="text-subtle">\u2014</span>;
      },
    },
  ];

  return (
    <ConsoleTable
      columns={columns}
      rows={items}
      getRowKey={(row) => row.channel_identity_id}
    />
  );
}
