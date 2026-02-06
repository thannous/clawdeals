import { describe, expect, it } from "vitest";
import { enforceAllowlist } from "./enforce-allowlist";

function buildPolicy(overrides = {}) {
  return {
    policy_json: {
      allowlist_agent_ids: [],
      denylist_agent_ids: [],
      ...overrides
    }
  };
}

describe("enforceAllowlist", () => {
  it("denies when agent is denylisted", async () => {
    const ctx: any = {};
    const result = await enforceAllowlist({
      ownerId: "owner-1",
      agentId: "agent-1",
      ctx,
      policyRecord: buildPolicy({
        allowlist_agent_ids: ["agent-1"],
        denylist_agent_ids: ["agent-1"]
      })
    });

    expect(result?.status).toBe(403);
    expect(ctx.auditEvent).toBe("policy.blocked_sender");
    expect(ctx.policy?.decision).toBe("DENIED");
    expect(ctx.outcome?.type).toBe("BLOCKED");
  });

  it("denies when allowlist active and agent missing", async () => {
    const ctx: any = {};
    const result = await enforceAllowlist({
      ownerId: "owner-1",
      agentId: "agent-2",
      ctx,
      policyRecord: buildPolicy({
        allowlist_agent_ids: ["agent-1"],
        denylist_agent_ids: []
      })
    });

    expect(result?.status).toBe(403);
    expect(ctx.policy?.decision).toBe("DENIED");
  });

  it("allows when allowlist is empty", async () => {
    const ctx: any = {};
    const result = await enforceAllowlist({
      ownerId: "owner-1",
      agentId: "agent-1",
      ctx,
      policyRecord: buildPolicy({
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      })
    });

    expect(result).toBeNull();
    expect(ctx.policy?.decision).toBe("AUTO_APPROVED");
  });

  it("skips when ownerId missing", async () => {
    const ctx: any = {};
    const result = await enforceAllowlist({ ownerId: null, agentId: "agent-1", ctx });
    expect(result).toBeNull();
    expect(ctx.policy?.decision).toBe("N_A");
  });
});
