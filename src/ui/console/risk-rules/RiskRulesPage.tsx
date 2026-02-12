import { useMemo, useState } from "react";
import { RISK_FLAG_VALUES } from "../../../shared/risk-rules";
import { useRiskRules } from "./useRiskRules";
import { useRiskRuleMutation } from "./useRiskRuleMutation";
import { useRiskRulesRun } from "./useRiskRulesRun";
import { useRiskRuleUnflag } from "./useRiskRuleUnflag";
import EmptyState from "../shared/EmptyState";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";

function formatWindow(seconds: number) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return "—";
  if (s % 86400 === 0) return `${s / 86400}d`;
  if (s % 3600 === 0) return `${s / 3600}h`;
  if (s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
}

export default function RiskRulesPage() {
  const { items, fetchState, error, refetch } = useRiskRules();
  const mutation = useRiskRuleMutation({ onSuccess: refetch });
  const runner = useRiskRulesRun();
  const unflag = useRiskRuleUnflag({ onSuccess: refetch });

  const [draftByRuleId, setDraftByRuleId] = useState<Record<string, any>>({});
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [runDry, setRunDry] = useState(false);
  const [runRuleKey, setRunRuleKey] = useState("");
  const [runMaxAgents, setRunMaxAgents] = useState("1000");

  const [unflagAgentId, setUnflagAgentId] = useState("");
  const [unflagFlag, setUnflagFlag] = useState("restricted");
  const [unflagReason, setUnflagReason] = useState("");

  const sortedItems = useMemo(
    () => [...items].sort((left: any, right: any) => String(left.rule_key).localeCompare(String(right.rule_key))),
    [items]
  );
  const baseDraftByRuleId = useMemo(() => {
    const next: Record<string, any> = {};
    for (const item of sortedItems) {
      if (!item?.risk_rule_id) continue;
      next[item.risk_rule_id] = {
        enabled: Boolean(item.enabled),
        threshold: Number(item.threshold),
        window_seconds: Number(item.window_seconds),
        cooldown_seconds: Number(item.cooldown_seconds),
        flag: String(item.flag || "")
      };
    }
    return next;
  }, [sortedItems]);
  const resolvedDraftByRuleId = useMemo(() => {
    const next: Record<string, any> = {};
    for (const item of sortedItems) {
      if (!item?.risk_rule_id) continue;
      const ruleId = String(item.risk_rule_id);
      next[ruleId] = {
        ...(baseDraftByRuleId[ruleId] || {}),
        ...(draftByRuleId[ruleId] || {})
      };
    }
    return next;
  }, [baseDraftByRuleId, draftByRuleId, sortedItems]);

  const setDraftField = (ruleId: string, key: string, value: any) => {
    setDraftByRuleId((prev) => ({
      ...prev,
      [ruleId]: {
        ...(prev[ruleId] || {}),
        [key]: value
      }
    }));
  };

  const saveRule = async (rule: any) => {
    const draft = resolvedDraftByRuleId[rule.risk_rule_id];
    if (!draft) return;

    setSaveMessage(null);
    try {
      await mutation.execute(rule.risk_rule_id, {
        enabled: Boolean(draft.enabled),
        threshold: Number(draft.threshold),
        window_seconds: Number(draft.window_seconds),
        cooldown_seconds: Number(draft.cooldown_seconds),
        flag: String(draft.flag || "")
      });
      setSaveMessage(`Saved ${rule.rule_key}`);
    } catch {
      // handled in hook error state
    }
  };

  const runRules = async () => {
    const maxAgents = Number.parseInt(runMaxAgents, 10);
    try {
      await runner.execute({
        dry_run: runDry,
        rule_key: runRuleKey.trim() || null,
        max_agents_per_rule: Number.isFinite(maxAgents) && maxAgents > 0 ? maxAgents : null
      });
    } catch {
      // handled by hook
    }
  };

  const submitUnflag = async () => {
    try {
      await unflag.execute({
        agent_id: unflagAgentId.trim(),
        flag: unflagFlag,
        reason: unflagReason.trim()
      });
      setUnflagReason("");
    } catch {
      // handled by hook
    }
  };

  return (
    <div data-testid="risk-rules-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>RISK RULES
          </h1>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <section className="bg-surface border border-border rounded p-4 space-y-4">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-subtle">Run Engine</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="flex items-center gap-2 text-xs font-mono text-text">
              <input
                type="checkbox"
                checked={runDry}
                onChange={(event) => setRunDry(event.target.checked)}
                className="accent-primary"
              />
              Dry run
            </label>
            <input
              type="text"
              value={runRuleKey}
              onChange={(event) => setRunRuleKey(event.target.value)}
              placeholder="rule_key (optional)"
              className="px-3 py-2 text-xs font-mono bg-bg border border-border rounded text-text"
            />
            <input
              type="number"
              min={1}
              value={runMaxAgents}
              onChange={(event) => setRunMaxAgents(event.target.value)}
              placeholder="max agents per rule"
              className="px-3 py-2 text-xs font-mono bg-bg border border-border rounded text-text"
            />
            <button
              onClick={runRules}
              disabled={runner.submitState === "loading"}
              className="px-4 py-2 text-xs font-mono font-bold uppercase border border-secondary text-secondary rounded hover:bg-secondary/10 disabled:opacity-50"
            >
              {runner.submitState === "loading" ? "Running..." : "Run now"}
            </button>
          </div>
          {runner.error && <p className="text-xs font-mono text-red-300">{runner.error}</p>}
          {runner.result && (
            <pre className="bg-bg border border-border rounded p-3 text-xs font-mono text-muted overflow-x-auto">
              {JSON.stringify(runner.result, null, 2)}
            </pre>
          )}
        </section>

        <section className="bg-surface border border-border rounded p-4 space-y-4">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-subtle">Rules</h2>

          {fetchState === "loading" && <SkeletonTable columns={7} rows={4} />}
          {fetchState === "error" && <ErrorState message={error || "Failed to load risk rules"} onRetry={refetch} />}
          {fetchState === "done" && sortedItems.length === 0 && (
            <EmptyState title="No risk rules found" subtitle="Create or seed rules in the database." />
          )}

          {fetchState === "done" && sortedItems.length > 0 && (
            <div className="overflow-x-auto border border-border rounded">
              <table className="w-full">
                <thead>
                  <tr className="bg-bg/60 border-b border-border">
                    <th className="text-left px-3 py-2 text-xs font-mono uppercase text-subtle">Rule</th>
                    <th className="text-left px-3 py-2 text-xs font-mono uppercase text-subtle">Signal</th>
                    <th className="text-left px-3 py-2 text-xs font-mono uppercase text-subtle">Threshold</th>
                    <th className="text-left px-3 py-2 text-xs font-mono uppercase text-subtle">Window</th>
                    <th className="text-left px-3 py-2 text-xs font-mono uppercase text-subtle">Cooldown</th>
                    <th className="text-left px-3 py-2 text-xs font-mono uppercase text-subtle">Flag</th>
                    <th className="text-left px-3 py-2 text-xs font-mono uppercase text-subtle">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((rule: any) => {
                    const draft = resolvedDraftByRuleId[rule.risk_rule_id] || {};
                    return (
                      <tr key={rule.risk_rule_id} className="border-b border-border/50">
                        <td className="px-3 py-2 text-xs font-mono text-text">
                          <div>{rule.rule_key}</div>
                          <label className="inline-flex items-center gap-2 text-xs text-muted mt-1">
                            <input
                              type="checkbox"
                              checked={Boolean(draft.enabled)}
                              onChange={(event) => setDraftField(rule.risk_rule_id, "enabled", event.target.checked)}
                              className="accent-primary"
                            />
                            enabled
                          </label>
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-muted">{rule.signal_type}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            value={draft.threshold ?? rule.threshold}
                            onChange={(event) => setDraftField(rule.risk_rule_id, "threshold", event.target.value)}
                            className="w-24 px-2 py-1 text-xs font-mono bg-bg border border-border rounded text-text"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            value={draft.window_seconds ?? rule.window_seconds}
                            onChange={(event) => setDraftField(rule.risk_rule_id, "window_seconds", event.target.value)}
                            className="w-28 px-2 py-1 text-xs font-mono bg-bg border border-border rounded text-text"
                          />
                          <div className="text-xs font-mono text-subtle mt-1">
                            {formatWindow(Number(draft.window_seconds ?? rule.window_seconds))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            value={draft.cooldown_seconds ?? rule.cooldown_seconds}
                            onChange={(event) => setDraftField(rule.risk_rule_id, "cooldown_seconds", event.target.value)}
                            className="w-28 px-2 py-1 text-xs font-mono bg-bg border border-border rounded text-text"
                          />
                          <div className="text-xs font-mono text-subtle mt-1">
                            {formatWindow(Number(draft.cooldown_seconds ?? rule.cooldown_seconds))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={draft.flag ?? rule.flag}
                            onChange={(event) => setDraftField(rule.risk_rule_id, "flag", event.target.value)}
                            className="px-2 py-1 text-xs font-mono bg-bg border border-border rounded text-text"
                          >
                            {RISK_FLAG_VALUES.map((flag) => (
                              <option key={flag} value={flag}>
                                {flag}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => saveRule(rule)}
                            disabled={mutation.submitState === "loading"}
                            className="px-3 py-1 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 disabled:opacity-50"
                          >
                            Save
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {mutation.error && <p className="text-xs font-mono text-red-300">{mutation.error}</p>}
          {saveMessage && <p className="text-xs font-mono text-green-300">{saveMessage}</p>}
        </section>

        <section className="bg-surface border border-border rounded p-4 space-y-4">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-subtle">Manual Unflag</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <input
              type="text"
              value={unflagAgentId}
              onChange={(event) => setUnflagAgentId(event.target.value)}
              placeholder="agent_id"
              className="px-3 py-2 text-xs font-mono bg-bg border border-border rounded text-text"
            />
            <select
              value={unflagFlag}
              onChange={(event) => setUnflagFlag(event.target.value)}
              className="px-3 py-2 text-xs font-mono bg-bg border border-border rounded text-text"
            >
              {RISK_FLAG_VALUES.map((flag) => (
                <option key={flag} value={flag}>
                  {flag}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={unflagReason}
              onChange={(event) => setUnflagReason(event.target.value)}
              placeholder="reason"
              className="px-3 py-2 text-xs font-mono bg-bg border border-border rounded text-text"
            />
            <button
              onClick={submitUnflag}
              disabled={unflag.submitState === "loading"}
              className="px-4 py-2 text-xs font-mono font-bold uppercase border border-red-400 text-red-300 rounded hover:bg-red-400/10 disabled:opacity-50"
            >
              {unflag.submitState === "loading" ? "Submitting..." : "Remove flag"}
            </button>
          </div>
          {unflag.error && <p className="text-xs font-mono text-red-300">{unflag.error}</p>}
          {unflag.lastResult && (
            <pre className="bg-bg border border-border rounded p-3 text-xs font-mono text-muted overflow-x-auto">
              {JSON.stringify(unflag.lastResult, null, 2)}
            </pre>
          )}
        </section>
      </main>
    </div>
  );
}
