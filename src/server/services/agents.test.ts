import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("./owners", () => ({
  ensureOwnerExists: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { ensureOwnerExists } from "./owners";
import { addAgentTrustFlag, createAgentWithOwnerLimit } from "./agents";

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
