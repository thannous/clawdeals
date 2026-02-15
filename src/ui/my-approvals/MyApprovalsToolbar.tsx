import { useTranslations } from "next-intl";
import AgentDropdown from "../shared/AgentDropdown";

const STATE_OPTIONS = ["PENDING", "APPROVED", "DENIED", "EXPIRED", "CANCELLED"];

interface Agent {
  id: string;
  name: string | null;
}

interface Props {
  state: string;
  onStateChange: (s: string | null) => void;
  agents: Agent[];
  selectedAgentId: string | null;
  onAgentChange: (id: string | null) => void;
}

export default function MyApprovalsToolbar({ state, onStateChange, agents, selectedAgentId, onAgentChange }: Props) {
  const t = useTranslations("myApprovals");

  return (
    <div data-testid="my-approvals-toolbar" className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-mono text-subtle uppercase mr-1">{t("toolbar.stateLabel")}</span>
        <button
          onClick={() => onStateChange(null)}
          className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
            !state
              ? "border-primary/40 text-primary bg-primary/10"
              : "border-border text-subtle hover:border-border-strong"
          }`}
        >
          {t("toolbar.all")}
        </button>
        {STATE_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onStateChange(state === s ? null : s)}
            className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
              state === s
                ? "border-primary/40 text-primary bg-primary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {s}
          </button>
        ))}
        <AgentDropdown agents={agents} selectedAgentId={selectedAgentId} onAgentChange={onAgentChange} />
      </div>
    </div>
  );
}
