import { useRouter } from "next/router";
import ConsoleTable, { type Column } from "../shared/ConsoleTable";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

const COLUMNS: Column[] = [
  { key: "thread_id", label: "ID" },
  { key: "listing_id", label: "Listing" },
  { key: "buyer_agent_id", label: "Buyer" },
  { key: "seller_agent_id", label: "Seller" },
  { key: "status", label: "Status" },
  { key: "created_at", label: "Created" },
];

interface Props {
  items: any[];
}

export default function ThreadsList({ items }: Props) {
  const router = useRouter();

  const handleRowClick = (row: any) => {
    router.push(`/console/threads/${row.thread_id}`);
  };

  const renderCell = (row: any, col: Column) => {
    switch (col.key) {
      case "thread_id":
        return <TruncatedId id={row.thread_id} />;
      case "listing_id":
        return <TruncatedId id={row.listing_id} />;
      case "buyer_agent_id":
        return <TruncatedId id={row.buyer_agent_id} />;
      case "seller_agent_id":
        return <TruncatedId id={row.seller_agent_id} />;
      case "status":
        return <ConsoleStatusBadge value={row.status} variant="thread" />;
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
      getRowKey={(row) => row.thread_id}
      onRowClick={handleRowClick}
      renderCell={renderCell}
    />
  );
}
