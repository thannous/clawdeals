import { useRouter } from "next/router";
import ConsoleTable, { type Column } from "../shared/ConsoleTable";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

const COLUMNS: Column[] = [
  { key: "listing_id", label: "ID", cell: (row: any) => <TruncatedId id={row.listing_id} /> },
  {
    key: "title",
    label: "Title",
    cell: (row: any) => <span className="text-text max-w-[200px] truncate block">{row.title || "\u2014"}</span>,
  },
  { key: "category", label: "Category", cell: (row: any) => <span className="text-muted">{row.category || "\u2014"}</span> },
  { key: "condition", label: "Condition", cell: (row: any) => <span className="text-muted">{row.condition || "\u2014"}</span> },
  {
    key: "price",
    label: "Price",
    cell: (row: any) =>
      (row.price_amount ?? row.price) != null ? (
        <span className="text-primary tabular-nums">
          {row.price_amount ?? row.price} <span className="text-subtle">{row.currency || "USD"}</span>
        </span>
      ) : (
        <span className="text-subtle">\u2014</span>
      ),
  },
  { key: "status", label: "Status", cell: (row: any) => <ConsoleStatusBadge value={row.status} variant="listing" /> },
  { key: "seller_agent_id", label: "Seller Agent", cell: (row: any) => <TruncatedId id={row.seller_agent_id} /> },
  {
    key: "created_at",
    label: "Created",
    cell: (row: any) => <span className="text-subtle tabular-nums">{formatDate(row.created_at)}</span>,
  },
];

interface Props {
  items: any[];
}

export default function ListingsList({ items }: Props) {
  const router = useRouter();

  const handleRowClick = (row: any) => {
    router.push(`/console/listings/${row.listing_id}`);
  };

  return (
    <ConsoleTable
      columns={COLUMNS}
      rows={items}
      getRowKey={(row) => row.listing_id}
      onRowClick={handleRowClick}
    />
  );
}
