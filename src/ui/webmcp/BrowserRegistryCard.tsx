import { useEffect, useMemo, useRef, useState } from "react";
import { Radar } from "lucide-react";

import {
  getBrowserReportedTools,
  isBrowserToolDiscoverySupported,
  subscribeBrowserToolChange,
  type BrowserReportedTool
} from "../../webmcp/adapter";

type DiscoveryState =
  | { kind: "unsupported" }
  | { kind: "loading" }
  | { kind: "ready"; tools: BrowserReportedTool[]; changes: number }
  | { kind: "error"; message: string };

function sameNames(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((name, index) => name === sortedB[index]);
}

/**
 * Shows what the *browser* says is registered, via `document.modelContext.getTools()` and the
 * `toolchange` event, next to what our provider believes it registered. A mismatch is a real bug;
 * "unavailable" is an honest statement about the runtime, never a pass.
 */
export default function BrowserRegistryCard({ providerToolNames }: { providerToolNames: readonly string[] }) {
  const [state, setState] = useState<DiscoveryState>({ kind: "loading" });
  const changesRef = useRef(0);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (!isBrowserToolDiscoverySupported()) {
        if (alive) setState({ kind: "unsupported" });
        return;
      }
      try {
        const tools = await getBrowserReportedTools();
        if (!alive) return;
        if (tools === null) {
          setState({ kind: "unsupported" });
          return;
        }
        setState({ kind: "ready", tools, changes: changesRef.current });
      } catch (error: any) {
        if (!alive) return;
        setState({ kind: "error", message: error?.message || "getTools() failed" });
      }
    };
    void refresh();
    const unsubscribe = subscribeBrowserToolChange(() => {
      changesRef.current += 1;
      void refresh();
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [providerToolNames]);

  const browserNames = useMemo(() => (state.kind === "ready" ? state.tools.map((tool) => tool.name) : []), [state]);
  const match = state.kind === "ready" ? sameNames(browserNames, providerToolNames) : null;
  const origin = state.kind === "ready" ? state.tools.find((tool) => tool.origin)?.origin ?? null : null;

  return (
    <div className="border border-border bg-surface p-5 sm:p-6" data-testid="webmcp-browser-registry">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">Browser-reported</p>
          <h2 className="mt-2 text-2xl font-bold uppercase">What the browser sees</h2>
        </div>
        <div className="inline-flex items-center gap-2 border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted">
          <Radar className="h-3.5 w-3.5" aria-hidden="true" />
          getTools() · toolchange
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {state.kind === "ready" ? (
          <span
            data-testid="webmcp-browser-registry-match"
            data-match={match ? "true" : "false"}
            className={`border px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider ${
              match ? "border-success/40 bg-success/10 text-success" : "border-error/40 bg-error/10 text-error"
            }`}
          >
            {match ? "Match" : "Mismatch"} · {browserNames.length} tool{browserNames.length === 1 ? "" : "s"}
          </span>
        ) : (
          <span
            data-testid="webmcp-browser-registry-match"
            data-match="unavailable"
            className="border border-border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-subtle"
          >
            {state.kind === "loading" ? "Reading…" : state.kind === "error" ? "getTools() error" : "getTools() unavailable in this runtime"}
          </span>
        )}
        {origin ? <span className="font-mono text-[11px] text-muted">origin {origin}</span> : null}
        {state.kind === "ready" && state.changes > 0 ? (
          <span className="font-mono text-[11px] text-muted" data-testid="webmcp-browser-registry-changes">
            {state.changes} toolchange event{state.changes === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      <ul className="mt-3 flex flex-wrap gap-2" data-testid="webmcp-browser-registry-tools">
        {state.kind === "ready" && state.tools.length > 0 ? (
          state.tools.map((tool) => (
            <li
              key={tool.name}
              data-testid="webmcp-browser-registry-tool"
              title={tool.description}
              className={`border px-2.5 py-1 font-mono text-[11px] ${
                providerToolNames.includes(tool.name)
                  ? "border-border text-text"
                  : "border-error/40 bg-error/10 text-error"
              }`}
            >
              {tool.name}
              {tool.annotations?.readOnlyHint ? <span className="ml-1 text-subtle">ro</span> : null}
            </li>
          ))
        ) : (
          <li className="border border-border px-2.5 py-1 font-mono text-[11px] text-subtle">
            {state.kind === "ready"
              ? "Browser reports no tools."
              : state.kind === "error"
                ? state.message
                : "Older WebMCP runtimes expose registerTool() only; the provider list on the left remains the reference."}
          </li>
        )}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Left: the tools our provider registered. Here: the same registry read back from{" "}
        <code className="font-mono">document.modelContext.getTools()</code>, refreshed on every{" "}
        <code className="font-mono">toolchange</code>. Connect or remove an agent key and watch both move from 5 to 11
        together.
      </p>
    </div>
  );
}
