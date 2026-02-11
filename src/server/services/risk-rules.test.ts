import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../audit/singleton", () => ({
  safeAuditLog: vi.fn().mockResolvedValue(undefined)
}));

import { manualUnflagRiskFlag, runRiskRulesEngine, updateRiskRule } from "./risk-rules";

class FakeRiskClient {
  rules: any[];
  candidatesBySignal: Record<string, any[]>;
  state = new Map<string, any>();
  agentFlags = new Map<string, string[]>();
  moderationActions: any[] = [];
  failFlagForAgents = new Set<string>();

  constructor({
    rules,
    candidatesBySignal,
    initialState,
    initialAgentFlags,
    failFlagForAgents
  }: {
    rules?: any[];
    candidatesBySignal?: Record<string, any[]>;
    initialState?: Record<string, any>;
    initialAgentFlags?: Record<string, string[]>;
    failFlagForAgents?: string[];
  } = {}) {
    this.rules = rules || [];
    this.candidatesBySignal = candidatesBySignal || {};
    if (initialState) {
      for (const [key, value] of Object.entries(initialState)) {
        this.state.set(key, value);
      }
    }
    if (initialAgentFlags) {
      for (const [agentId, flags] of Object.entries(initialAgentFlags)) {
        this.agentFlags.set(agentId, [...flags]);
      }
    }
    if (Array.isArray(failFlagForAgents)) {
      for (const agentId of failFlagForAgents) this.failFlagForAgents.add(agentId);
    }
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  async rpc(name: string, params: any) {
    if (name === "risk_rule_candidates_v1") {
      return {
        data: this.candidatesBySignal[params.p_signal_type] || [],
        error: null
      };
    }

    if (name === "add_agent_trust_flag_if_missing_v1") {
      const agentId = String(params.p_agent_id || "");
      if (this.failFlagForAgents.has(agentId)) {
        return { data: null, error: { message: "flag failed" } };
      }
      const existing = this.agentFlags.get(agentId);
      if (!existing) {
        return { data: null, error: null };
      }
      const flag = String(params.p_flag || "");
      if (existing.includes(flag)) {
        return { data: false, error: null };
      }
      existing.push(flag);
      this.agentFlags.set(agentId, existing);
      return { data: true, error: null };
    }

    if (name === "remove_agent_trust_flag_v1") {
      const agentId = String(params.p_agent_id || "");
      const existing = this.agentFlags.get(agentId);
      if (!existing) {
        return { data: null, error: null };
      }
      const flag = String(params.p_flag || "");
      const next = existing.filter((entry) => entry !== flag);
      this.agentFlags.set(agentId, next);
      return { data: next, error: null };
    }

    return { data: null, error: { message: `Unsupported RPC: ${name}` } };
  }
}

class FakeQuery {
  client: FakeRiskClient;
  table: string;
  operation: "select" | "update" | "insert" | "upsert" = "select";
  payload: any = null;
  filters: Record<string, any> = {};

  constructor(client: FakeRiskClient, table: string) {
    this.client = client;
    this.table = table;
  }

  select(_columns: string) {
    return this;
  }

  order(_col: string, _opts?: any) {
    return this;
  }

  eq(column: string, value: any) {
    this.filters[column] = value;
    return this;
  }

  update(payload: any) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  insert(payload: any) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  upsert(payload: any) {
    this.operation = "upsert";
    this.payload = payload;
    return this;
  }

  async maybeSingle() {
    if (this.table === "risk_rule_state" && this.operation === "select") {
      const key = `${this.filters.risk_rule_id}:${this.filters.agent_id}`;
      return { data: this.client.state.get(key) || null, error: null };
    }

    if (this.table === "agents" && this.operation === "select") {
      const agentId = String(this.filters.id || "");
      if (!this.client.agentFlags.has(agentId)) return { data: null, error: null };
      return { data: { trust_flags: this.client.agentFlags.get(agentId) || [] }, error: null };
    }

    if (this.table === "risk_rules" && this.operation === "update") {
      const ruleId = String(this.filters.risk_rule_id || "");
      const idx = this.client.rules.findIndex((rule) => rule.risk_rule_id === ruleId);
      if (idx < 0) return { data: null, error: null };
      const next = { ...this.client.rules[idx], ...this.payload };
      this.client.rules[idx] = next;
      return { data: next, error: null };
    }

    return { data: null, error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    if (this.table === "risk_rules" && this.operation === "select") {
      let rows = [...this.client.rules];
      if (this.filters.enabled !== undefined) {
        rows = rows.filter((row) => row.enabled === this.filters.enabled);
      }
      if (this.filters.rule_key !== undefined) {
        rows = rows.filter((row) => row.rule_key === this.filters.rule_key);
      }
      return { data: rows, error: null };
    }

    if (this.table === "risk_rules" && this.operation === "update") {
      const ruleId = String(this.filters.risk_rule_id || "");
      const idx = this.client.rules.findIndex((rule) => rule.risk_rule_id === ruleId);
      if (idx >= 0) {
        this.client.rules[idx] = { ...this.client.rules[idx], ...this.payload };
      }
      return { data: null, error: null };
    }

    if (this.table === "risk_rule_state" && this.operation === "upsert") {
      const key = `${this.payload.risk_rule_id}:${this.payload.agent_id}`;
      this.client.state.set(key, { ...this.payload });
      return { data: null, error: null };
    }

    if (this.table === "moderation_actions" && this.operation === "insert") {
      this.client.moderationActions.push(this.payload);
      return { data: null, error: null };
    }

    if (this.table === "moderation_actions" && this.operation === "select") {
      return { data: this.client.moderationActions, error: null };
    }

    return { data: null, error: null };
  }
}

describe("risk-rules service", () => {
  const RULE_ID = "11111111-1111-4111-8111-111111111111";
  const AGENT_A = "22222222-2222-4222-8222-222222222222";
  const AGENT_B = "33333333-3333-4333-8333-333333333333";

  const baseRule = {
    risk_rule_id: RULE_ID,
    rule_key: "rate_limit_triggers_1h",
    signal_type: "rate_limit_triggers",
    threshold: 12,
    window_seconds: 3600,
    cooldown_seconds: 3600,
    flag: "noisy_client",
    enabled: true
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies flags for matching candidates", async () => {
    const client = new FakeRiskClient({
      rules: [baseRule],
      candidatesBySignal: {
        rate_limit_triggers: [{ agent_id: AGENT_A, signal_count: 14 }]
      },
      initialAgentFlags: {
        [AGENT_A]: []
      }
    });

    const summary = await runRiskRulesEngine({
      client,
      now: new Date("2026-02-11T12:00:00.000Z"),
      actor: { type: "owner", id: "00000000-0000-4000-a000-000000000000" }
    });

    expect(summary.rules_scanned).toBe(1);
    expect(summary.agents_evaluated).toBe(1);
    expect(summary.flags_applied).toBe(1);
    expect(client.agentFlags.get(AGENT_A)).toContain("noisy_client");
    expect(client.state.get(`${RULE_ID}:${AGENT_A}`)).toBeTruthy();
    expect(client.moderationActions).toHaveLength(1);
  });

  it("respects cooldown", async () => {
    const now = new Date("2026-02-11T12:00:00.000Z");
    const client = new FakeRiskClient({
      rules: [baseRule],
      candidatesBySignal: {
        rate_limit_triggers: [{ agent_id: AGENT_A, signal_count: 14 }]
      },
      initialState: {
        [`${RULE_ID}:${AGENT_A}`]: { last_triggered_at: "2026-02-11T11:30:00.000Z" }
      },
      initialAgentFlags: {
        [AGENT_A]: []
      }
    });

    const summary = await runRiskRulesEngine({ client, now });
    expect(summary.skipped_cooldown).toBe(1);
    expect(summary.flags_applied).toBe(0);
  });

  it("supports dry_run without mutations", async () => {
    const client = new FakeRiskClient({
      rules: [baseRule],
      candidatesBySignal: {
        rate_limit_triggers: [{ agent_id: AGENT_A, signal_count: 14 }]
      },
      initialAgentFlags: {
        [AGENT_A]: []
      }
    });

    const summary = await runRiskRulesEngine({ client, dryRun: true });
    expect(summary.would_apply).toBe(1);
    expect(summary.flags_applied).toBe(0);
    expect(client.agentFlags.get(AGENT_A)).toEqual([]);
  });

  it("counts already flagged agents", async () => {
    const client = new FakeRiskClient({
      rules: [baseRule],
      candidatesBySignal: {
        rate_limit_triggers: [{ agent_id: AGENT_A, signal_count: 14 }]
      },
      initialAgentFlags: {
        [AGENT_A]: ["noisy_client"]
      }
    });

    const summary = await runRiskRulesEngine({ client });
    expect(summary.already_flagged).toBe(1);
    expect(summary.flags_applied).toBe(0);
  });

  it("continues after per-agent errors", async () => {
    const client = new FakeRiskClient({
      rules: [baseRule],
      candidatesBySignal: {
        rate_limit_triggers: [
          { agent_id: AGENT_A, signal_count: 20 },
          { agent_id: AGENT_B, signal_count: 20 }
        ]
      },
      initialAgentFlags: {
        [AGENT_A]: [],
        [AGENT_B]: []
      },
      failFlagForAgents: [AGENT_A]
    });

    const summary = await runRiskRulesEngine({ client });
    expect(summary.errors).toBe(1);
    expect(summary.flags_applied).toBe(1);
    expect(client.agentFlags.get(AGENT_A)).toEqual([]);
    expect(client.agentFlags.get(AGENT_B)).toContain("noisy_client");
  });

  it("updates rule config", async () => {
    const client = new FakeRiskClient({ rules: [baseRule] });
    const updated = await updateRiskRule({
      client,
      ruleId: RULE_ID,
      patch: {
        enabled: false,
        threshold: 20,
        window_seconds: 7200,
        cooldown_seconds: 7200,
        flag: "restricted"
      },
      updatedBy: "00000000-0000-4000-a000-000000000000"
    });

    expect(updated.enabled).toBe(false);
    expect(updated.threshold).toBe(20);
    expect(updated.flag).toBe("restricted");
  });

  it("manually removes risk flag", async () => {
    const client = new FakeRiskClient({
      initialAgentFlags: {
        [AGENT_A]: ["restricted", "quarantined"]
      }
    });

    const result = await manualUnflagRiskFlag({
      client,
      agentId: AGENT_A,
      flag: "restricted",
      reason: "manual override",
      actor: { type: "owner", id: "00000000-0000-4000-a000-000000000000" }
    });

    expect(result.removed).toBe(true);
    expect(result.trust_flags).toEqual(["quarantined"]);
  });
});

