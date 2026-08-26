import { useSyncExternalStore } from "react";

import { getWebMcpActivities, subscribeWebMcpActivities } from "./ui-bridge";

export default function ActivityHud() {
  const entries = useSyncExternalStore(subscribeWebMcpActivities, getWebMcpActivities, getWebMcpActivities);
  if (!entries.length) return null;

  return (
    <aside
      data-testid="webmcp-activity-hud"
      className="fixed bottom-4 left-4 z-40 w-[min(100%-2rem,22rem)] border border-border bg-surface/95 backdrop-blur-sm rounded clip-corner p-3 space-y-2"
    >
      <div className="text-[10px] font-mono uppercase tracking-widest text-subtle">Agent activity</div>
      <ol className="space-y-1.5 max-h-40 overflow-auto">
        {entries.slice(0, 6).map((entry) => (
          <li key={entry.id} className="text-xs font-mono text-muted leading-snug">
            <span className={entry.ok === false ? "text-error" : "text-primary"}>{entry.toolName}</span>
            <span className="text-subtle"> — </span>
            <span className="text-text">{entry.summary}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
