import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("./owners", () => ({
  ensureOwnerExists: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { ensureOwnerExists } from "./owners";
import { addAgentTrustFlag, claimUnownedAgentToOwner, createAgentWithOwnerLimit } from "./agents";

const ensureOwnerExistsMock = vi.mocked(ensureOwnerExists);

describe("addAgentTrustFlag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the atomic RPC", async () => {
    const client: any = {
      rpc: vi.fn().mockResolvedValue({ data: ["under_review"], error: null })
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    await addAgentTrustFlag("00000000-0000-0000-0000-000000000001", "under_review");

    expect(client.rpc).toHaveBeenCalledWith("add_agent_trust_flag_v1", {
      p_agent_id: "00000000-0000-0000-0000-000000000001",
      p_flag: "under_review"
    });
  });

  it("throws NOT_FOUND when the agent does not exist", async () => {
    const client: any = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null })
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    await expect(
      addAgentTrustFlag("00000000-0000-0000-0000-000000000002", "under_review")
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
});

describe("createAgentWithOwnerLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureOwnerExistsMock.mockResolvedValue({
      owner_id: "00000000-0000-0000-0000-000000000010",
      email_verified_at: null,
      phone_verified_at: null
    } as any);
  });

  it("calls atomic create RPC with owner lock-aware limit", async () => {
    const client: any = {
      rpc: vi.fn().mockResolvedValue({
        data: { id: "00000000-0000-0000-0000-000000000011", owner_id: "00000000-0000-0000-0000-000000000010" },
        error: null
      })
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const agent = await createAgentWithOwnerLimit({
      ownerId: "00000000-0000-0000-0000-000000000010",
      ownerAgentLimit: 3,
      name: "My Agent",
      metadata: { connect_session_id: "session-1" }
    });

    expect(agent.id).toBe("00000000-0000-0000-0000-000000000011");
    expect(client.rpc).toHaveBeenCalledWith("create_agent_with_owner_limit_v1", {
      p_owner_id: "00000000-0000-0000-0000-000000000010",
      p_name: "My Agent",
      p_status: "active",
      p_metadata: { connect_session_id: "session-1" },
      p_wallet_address: null,
      p_trust_score: 10,
      p_trust_flags: ["unverified_owner", "quarantined"],
      p_trust_formula_version: 1,
      p_owner_agent_limit: 3
    });
  });

  it("maps null RPC response to OWNER_AGENT_LIMIT_REACHED", async () => {
    const client: any = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null })
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    await expect(
      createAgentWithOwnerLimit({
        ownerId: "00000000-0000-0000-0000-000000000010",
        ownerAgentLimit: 1,
        name: "My Agent"
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "OWNER_AGENT_LIMIT_REACHED",
      details: { owner_agent_limit: 1 }
    });
  });
});

describe("claimUnownedAgentToOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claims an unowned agent", async () => {
    const selectChain: any = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "agent-1", owner_id: null, name: "Bot" },
        error: null
      })
    };
    const countChain: any = {
      eq: vi.fn().mockResolvedValue({ count: 0, error: null })
    };
    const updateChain: any = {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "agent-1", owner_id: "owner-1", name: "Bot" },
        error: null
      })
    };
    let agentsCallCount = 0;
    const client: any = {
      from: vi.fn((table: string) => {
        if (table !== "agents") throw new Error("unexpected table");
        agentsCallCount += 1;
        if (agentsCallCount === 1) {
          return {
            select: vi.fn(() => selectChain)
          };
        }
        if (agentsCallCount === 2) {
          return {
            select: vi.fn(() => countChain)
          };
        }
        return {
          update: vi.fn(() => updateChain)
        };
      })
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const out = await claimUnownedAgentToOwner({ agentId: "agent-1", ownerId: "owner-1" });
    expect(out).toEqual({
      agent_id: "agent-1",
      owner_id: "owner-1",
      name: "Bot",
      claimed: true
    });
  });

  it("rejects claim when target owner reached OWNER_AGENT_LIMIT", async () => {
    const selectChain: any = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "agent-1", owner_id: null, name: "Bot" },
        error: null
      })
    };
    const countChain: any = {
      eq: vi.fn().mockResolvedValue({ count: 1, error: null })
    };
    const updateMock = vi.fn();
    let agentsCallCount = 0;
    const client: any = {
      from: vi.fn((table: string) => {
        if (table !== "agents") throw new Error("unexpected table");
        agentsCallCount += 1;
        if (agentsCallCount === 1) {
          return {
            select: vi.fn(() => selectChain)
          };
        }
        return {
          select: vi.fn(() => countChain),
          update: updateMock
        };
      })
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    await expect(claimUnownedAgentToOwner({ agentId: "agent-1", ownerId: "owner-1" })).rejects.toMatchObject({
      status: 409,
      code: "OWNER_AGENT_LIMIT_REACHED",
      details: { owner_agent_limit: 1 }
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("is idempotent when agent is already owned by same owner", async () => {
    const client: any = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "agent-1", owner_id: "owner-1", name: "Bot" },
            error: null
          })
        }))
      }))
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const out = await claimUnownedAgentToOwner({ agentId: "agent-1", ownerId: "owner-1" });
    expect(out.claimed).toBe(false);
    expect(out.owner_id).toBe("owner-1");
  });

  it("rejects claim when already owned by another owner", async () => {
    const client: any = {
      from: vi.fn((table: string) => {
        if (table === "agents") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "agent-1", owner_id: "owner-2", name: "Bot" },
                error: null
              })
            }))
          };
        }
        if (table === "owners") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  owner_id: "owner-2",
                  email: "owner2@example.com",
                  phone_e164: null,
                  email_verified_at: null,
                  phone_verified_at: null
                },
                error: null
              })
            }))
          };
        }
        throw new Error(`unexpected table ${table}`);
      })
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    await expect(claimUnownedAgentToOwner({ agentId: "agent-1", ownerId: "owner-1" })).rejects.toMatchObject({
      status: 409,
      code: "AGENT_ALREADY_CLAIMED"
    });
  });

  it("claims agent from placeholder owner without auth links or sessions", async () => {
    const selectAgentChain: any = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "agent-1", owner_id: "owner-placeholder", name: "Bot" },
        error: null
      })
    };
    const selectOwnerChain: any = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          owner_id: "owner-placeholder",
          email: null,
          phone_e164: null,
          email_verified_at: null,
          phone_verified_at: null
        },
        error: null
      })
    };
    const linksChain: any = {
      eq: vi.fn().mockResolvedValue({ count: 0, error: null })
    };
    const sessionsChain: any = {
      eq: vi.fn().mockResolvedValue({ count: 0, error: null })
    };
    const countChain: any = {
      eq: vi.fn().mockResolvedValue({ count: 0, error: null })
    };
    const updateChain: any = {
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "agent-1", owner_id: "owner-1", name: "Bot" },
        error: null
      })
    };

    const client: any = {
      from: vi.fn((table: string) => {
        if (table === "agents") {
          const step = (client.__agentStep = (client.__agentStep || 0) + 1);
          if (step === 1) {
            return {
              select: vi.fn(() => selectAgentChain)
            };
          }
          if (step === 2) {
            return {
              select: vi.fn(() => countChain)
            };
          }
          return {
            update: vi.fn(() => {
              updateChain.eq = vi.fn().mockReturnThis();
              return updateChain;
            })
          };
        }
        if (table === "owners") {
          return {
            select: vi.fn(() => selectOwnerChain)
          };
        }
        if (table === "owner_auth_links") {
          return {
            select: vi.fn(() => linksChain)
          };
        }
        if (table === "owner_sessions") {
          return {
            select: vi.fn(() => sessionsChain)
          };
        }
        throw new Error(`unexpected table ${table}`);
      })
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const out = await claimUnownedAgentToOwner({ agentId: "agent-1", ownerId: "owner-1" });
    expect(out).toEqual({
      agent_id: "agent-1",
      owner_id: "owner-1",
      name: "Bot",
      claimed: true
    });
  });
});
