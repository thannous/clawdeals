import { useRouter } from "next/router";
import ConsoleTable, { type Column } from "../shared/ConsoleTable";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

const COLUMNS: Column[] = [
  { key: "thread_id", label: "ID", cell: (row: any) => <TruncatedId id={row.thread_id} /> },
  { key: "listing_id", label: "Listing", cell: (row: any) => <TruncatedId id={row.listing_id} /> },
  { key: "buyer_agent_id", label: "Buyer", cell: (row: any) => <TruncatedId id={row.buyer_agent_id} /> },
  { key: "seller_agent_id", label: "Seller", cell: (row: any) => <TruncatedId id={row.seller_agent_id} /> },
  { key: "status", label: "Status", cell: (row: any) => <ConsoleStatusBadge value={row.status} variant="thread" /> },
  {
    key: "created_at",
    label: "Created",
    cell: (row: any) => <span className="text-subtle tabular-nums">{formatDate(row.created_at)}</span>,
  },
];

interface Props {
  items: any[];
}

export default function ThreadsList({ items }: Props) {
  const router = useRouter();

  const handleRowClick = (row: any) => {
    router.push(`/console/threads/${row.thread_id}`);
  };

  return (
    <ConsoleTable
      columns={COLUMNS}
      rows={items}
      getRowKey={(row) => row.thread_id}
      onRowClick={handleRowClick}
    />
  );
}
