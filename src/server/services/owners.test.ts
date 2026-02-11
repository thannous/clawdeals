import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { getOwnerByEmail } from "./owners";

function makeClient() {
  const chain: any = {
    select: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn()
  };

  return {
    client: {
      from: vi.fn(() => chain)
    } as any,
    chain
  };
}

describe("owners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries owner emails case-insensitively", async () => {
    const { client, chain } = makeClient();
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    chain.maybeSingle.mockResolvedValue({
      data: { owner_id: "owner-1", email: "MiXeD_Case%@Example.com" },
      error: null
    });

    const result = await getOwnerByEmail("MiXeD_Case%@Example.com");

    expect(result?.owner_id).toBe("owner-1");
    expect(chain.ilike).toHaveBeenCalledWith("email", "mixed\\_case\\%@example.com");
  });

  it("returns null without querying when email is empty", async () => {
    const { client } = makeClient();
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const result = await getOwnerByEmail("   ");

    expect(result).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });
});
