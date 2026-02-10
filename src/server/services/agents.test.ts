import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { addAgentTrustFlag } from "./agents";

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

