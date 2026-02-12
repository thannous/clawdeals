import { useState } from "react";
import { formatDate } from "../shared/formatDate";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";

interface Props {
  replay: any;
  replayState: "idle" | "loading" | "done" | "error";
  replayError: string | null;
  onClear: () => void;
}

export default function ReplayPanel({ replay, replayState, replayError, onClear }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  if (replayState === "idle") return null;

  const toggleStep = (idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="bg-surface border border-border rounded clip-corner p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-text">
          State Replay
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="px-2 py-0.5 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          <button
            onClick={onClear}
            className="px-2 py-0.5 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {replayState === "loading" && (
        <p className="text-xs font-mono text-subtle animate-pulse">Loading replay...</p>
      )}

      {replayState === "error" && (
        <p className="text-xs font-mono text-error">{replayError || "Failed to load replay"}</p>
      )}

      {replayState === "done" && expanded && replay && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-mono font-bold text-subtle uppercase tracking-wider mb-1">Current State</p>
            <pre className="text-xs font-mono text-text bg-bg/60 border border-border rounded p-3 overflow-x-auto max-h-60 overflow-y-auto">
              {JSON.stringify(replay.current_state, null, 2)}
            </pre>
          </div>

          {replay.steps && replay.steps.length > 0 && (
            <div>
              <p className="text-xs font-mono font-bold text-subtle uppercase tracking-wider mb-2">
                Steps ({replay.steps.length})
              </p>
              <ol className="space-y-2">
                {replay.steps.map((step: any, idx: number) => (
                  <li key={idx} className="border border-border/50 rounded p-2">
                    <button
                      onClick={() => toggleStep(idx)}
                      className="w-full flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-subtle tabular-nums">
                          {formatDate(step.ts)}
                        </span>
                        <span className="text-xs font-mono font-bold text-text">
                          {step.action || "\u2014"}
                        </span>
                        <ConsoleStatusBadge value={step.outcome || "UNKNOWN"} variant="audit" />
                      </div>
                      <span className="text-xs font-mono text-subtle">
                        {expandedSteps.has(idx) ? "\u25B2" : "\u25BC"}
                      </span>
                    </button>
                    {expandedSteps.has(idx) && step.delta && (
                      <pre className="mt-2 text-xs font-mono text-text bg-bg/60 border border-border rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
                        {JSON.stringify(step.delta, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
