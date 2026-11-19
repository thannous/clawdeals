import { useTranslations } from "next-intl";
import { formatDate } from "../console/shared/formatDate";

function formatBytes(bytes: unknown) {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return "";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} kB`;
}

// One side's confirmed evidence files. `fileBase` is the API path that serves a file by id.
export default function EvidenceList({ items, fileBase, testId }: { items: any[]; fileBase: string; testId?: string }) {
  const t = useTranslations("protectedCheckout");

  if (!items || items.length === 0) {
    return <p data-testid={testId} className="text-sm text-subtle">{t("dispute.noEvidence")}</p>;
  }

  return (
    <ul data-testid={testId} className="space-y-2">
      {items.map((item: any) => (
        <li
          key={item.evidence_item_id}
          className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3 text-xs font-mono"
        >
          <span className="text-subtle">
            {item.content_type} · {formatBytes(item.bytes)} · {formatDate(item.created_at)}
          </span>
          <a
            href={`${fileBase}/${encodeURIComponent(item.evidence_item_id)}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline shrink-0"
          >
            {t("dispute.viewFile")}
          </a>
        </li>
      ))}
    </ul>
  );
}
