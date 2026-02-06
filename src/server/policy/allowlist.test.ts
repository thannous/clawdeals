import { describe, expect, it } from "vitest";
import { evaluateAgentAccess } from "./allowlist";

const policy = {
  version: 3,
  allowlist_agent_ids: ["agent-1", "agent-2"],
  denylist_agent_ids: ["agent-2", "agent-9"]
};

describe("evaluateAgentAccess", () => {
  it("denies if agent is denylisted", () => {
    const result = evaluateAgentAccess({ policy, agentId: "agent-2" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("denylisted");
    expect(result.policy_version).toBe(3);
  });

  it("denies when allowlist is active and agent is missing", () => {
    const result = evaluateAgentAccess({ policy, agentId: "agent-3" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_allowlisted");
  });

  it("allows when agent is allowlisted", () => {
    const result = evaluateAgentAccess({ policy, agentId: "agent-1" });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("allowlisted");
  });

  it("allows when no agent id is provided", () => {
    const result = evaluateAgentAccess({ policy, agentId: null });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("no_agent_id");
  });
});
