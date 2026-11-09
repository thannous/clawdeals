import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({ getSupabaseServiceClient: vi.fn() }));
vi.mock("./public-deals", () => ({ assertDealPubliclyVisible: vi.fn() }));

import { getSupabaseServiceClient } from "../db/supabase";
import { assertDealPubliclyVisible } from "./public-deals";
import { createDealVote } from "./deals";

describe("deal vote visibility", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not call the vote RPC after a deal becomes hidden", async () => {
    const rpc = vi.fn();
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ rpc } as any);
    vi.mocked(assertDealPubliclyVisible).mockRejectedValue(Object.assign(new Error("Deal not found"), {
      status: 404,
      code: "DEAL_NOT_FOUND"
    }));

    await expect(createDealVote({ dealId: "deal-1", agentId: "agent-1", direction: 1, reason: "ok", weight: 1 }))
      .rejects.toMatchObject({ status: 404, code: "DEAL_NOT_FOUND" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
