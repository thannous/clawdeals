import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

interface Agent {
  id: string;
  name: string | null;
}

interface Props {
  agents: Agent[];
  selectedAgentId: string | null;
  onAgentChange: (id: string | null) => void;
}

export default function AgentDropdown({ agents, selectedAgentId, onAgentChange }: Props) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  if (agents.length === 0) return null;

  const selected = agents.find((a) => a.id === selectedAgentId);
  const label = selected ? (selected.name || `Agent ${agents.indexOf(selected) + 1}`) : t("allAgents");

  return (
    <div ref={ref} className="relative" data-testid="agent-dropdown">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="h-7 px-2 border border-border text-xs font-mono font-bold flex items-center gap-1.5 text-subtle hover:border-border-strong transition-colors"
      >
        <span className="text-xs font-mono text-subtle uppercase mr-0.5">{t("agentFilter")}</span>
        {label}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-surface border border-border shadow-lg z-50 min-w-[160px]">
          <button
            type="button"
            onClick={() => { onAgentChange(null); setOpen(false); }}
            className={`block w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
              !selectedAgentId
                ? "text-secondary bg-secondary/10"
                : "text-muted hover:text-text hover:bg-surface-alt"
            }`}
          >
            {t("allAgents")}
          </button>
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => { onAgentChange(a.id); setOpen(false); }}
              className={`block w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
                selectedAgentId === a.id
                  ? "text-secondary bg-secondary/10"
                  : "text-muted hover:text-text hover:bg-surface-alt"
              }`}
            >
              {a.name || `Agent ${agents.indexOf(a) + 1}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
