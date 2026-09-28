import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const mockClient = {
  from: fromMock
};

vi.mock("../../server/db/supabase", () => ({
  getSupabaseServiceClient: vi.fn(() => mockClient)
}));

vi.mock("../../server/services/supabase-errors", () => ({
  mapSupabaseError: vi.fn((error: any) => ({
    message: error?.message || "DB error",
    status: error?.status || 500,
    code: error?.code || "DB_ERROR"
  }))
}));

import {
  createOwnerAuthLink,
  getOwnerLinkByAuthIdentity
} from "../../server/services/owner-auth-links";

const ownerId = "11111111-1111-4111-8111-111111111111";

describe("owner-auth-links service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a provider-neutral Neon Auth link without a Supabase user id", async () => {
    const query: any = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { owner_id: ownerId, auth_provider: "neon", auth_subject: "neon-user-1" },
        error: null
      })
    };
    fromMock.mockReturnValue(query);

    await createOwnerAuthLink({
      ownerId,
      authProvider: "NEON",
      authSubject: " neon-user-1 ",
      email: "owner@example.com"
    });

    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      owner_id: ownerId,
      auth_provider: "neon",
      auth_subject: "neon-user-1",
      supabase_user_id: null
    }));
  });

  it("looks up an opaque provider subject without assuming UUID format", async () => {
    const query: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { owner_id: ownerId }, error: null })
    };
    fromMock.mockReturnValue(query);

    await expect(
      getOwnerLinkByAuthIdentity({ authProvider: "neon", authSubject: "user_subject:123" })
    ).resolves.toEqual({ owner_id: ownerId });
    expect(query.eq).toHaveBeenCalledWith("auth_provider", "neon");
    expect(query.eq).toHaveBeenCalledWith("auth_subject", "user_subject:123");
  });
});
