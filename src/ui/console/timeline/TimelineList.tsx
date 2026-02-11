import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";

const ACTOR_TYPE_COLORS: Record<string, string> = {
  agent: "text-primary",
  owner: "text-secondary",
  human: "text-secondary",
  anonymous: "text-subtle",
  system: "text-muted",
};

interface Props {
  items: any[];
  onSelect: (item: any) => void;
}

export default function TimelineList({ items, onSelect }: Props) {
  return (
    <ol className="relative border-l border-border ml-3">
      {items.map((item) => (
        <li
          key={item.audit_id}
          role="button"
          tabIndex={0}
          className={`mb-4 ml-6 cursor-pointer hover:bg-surface/50 rounded p-2 transition-colors ${
            item.is_primary === false ? "opacity-50" : ""
          }`}
          onClick={() => onSelect(item)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(item); } }}
        >
          <span
            className={`absolute -left-1.5 w-3 h-3 rounded-full border border-bg ${
              item.is_primary !== false ? "bg-primary" : "bg-border"
            }`}
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono text-subtle tabular-nums">
              {formatDate(item.ts)}
            </span>

            <span className="text-xs font-mono font-bold text-text">{item.action || "\u2014"}</span>

            {item.actor?.type && (
              <span
                className={`inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase border border-border rounded ${
                  ACTOR_TYPE_COLORS[item.actor.type] || "text-muted"
                }`}
              >
                {item.actor.type}
              </span>
            )}

            {item.actor?.id && (
              <TruncatedId id={item.actor.id} />
            )}

            <ConsoleStatusBadge value={item.outcome || "UNKNOWN"} variant="audit" />

            {item.entity?.type && (
              <span className="text-[10px] font-mono text-subtle uppercase">{item.entity.type}</span>
            )}

            {item.entity?.id && (
              <TruncatedId id={item.entity.id} />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
