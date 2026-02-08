import { useRouter } from "next/router";
import ConsoleTable, { type Column } from "../shared/ConsoleTable";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

const COLUMNS: Column[] = [
  { key: "listing_id", label: "ID" },
  { key: "title", label: "Title" },
  { key: "category", label: "Category" },
  { key: "condition", label: "Condition" },
  { key: "price", label: "Price" },
  { key: "status", label: "Status" },
  { key: "seller_agent_id", label: "Seller Agent" },
  { key: "created_at", label: "Created" },
];

interface Props {
  items: any[];
}

export default function ListingsList({ items }: Props) {
  const router = useRouter();

  const handleRowClick = (row: any) => {
    router.push(`/console/listings/${row.listing_id}`);
  };

  const renderCell = (row: any, col: Column) => {
    switch (col.key) {
      case "listing_id":
        return <TruncatedId id={row.listing_id} />;
      case "title":
        return <span className="text-text max-w-[200px] truncate block">{row.title || "\u2014"}</span>;
      case "category":
        return <span className="text-muted">{row.category || "\u2014"}</span>;
      case "condition":
        return <span className="text-muted">{row.condition || "\u2014"}</span>;
      case "price":
        return row.price != null ? (
          <span className="text-primary tabular-nums">
            {row.price} <span className="text-subtle">{row.currency || "USD"}</span>
          </span>
        ) : (
          <span className="text-subtle">\u2014</span>
        );
      case "status":
        return <ConsoleStatusBadge value={row.status} variant="listing" />;
      case "seller_agent_id":
        return <TruncatedId id={row.seller_agent_id} />;
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
      getRowKey={(row) => row.listing_id}
      onRowClick={handleRowClick}
      renderCell={renderCell}
    />
  );
}
