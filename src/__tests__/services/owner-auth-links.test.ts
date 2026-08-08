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
  createOwnerLink,
  getOwnerLinkByAuthIdentity,
  getOwnerLinkBySupabaseUserId,
  touchOwnerLinkLogin
} from "../../server/services/owner-auth-links";

const ownerId = "11111111-1111-4111-8111-111111111111";
const supabaseUserId = "22222222-2222-4222-8222-222222222222";

describe("owner-auth-links service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates supabaseUserId in getOwnerLinkBySupabaseUserId", async () => {
    await expect(getOwnerLinkBySupabaseUserId("not-a-uuid")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400
    });
  });

  it("creates owner auth link", async () => {
    const query: any = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          link_id: "33333333-3333-4333-8333-333333333333",
          owner_id: ownerId,
          supabase_user_id: supabaseUserId
        },
        error: null
      })
    };
    fromMock.mockImplementation((table: string) => {
      expect(table).toBe("owner_auth_links");
      return query;
    });

    const now = new Date("2026-02-12T10:00:00.000Z");
    const result = await createOwnerLink({
      ownerId,
      supabaseUserId,
      email: "owner@example.com",
      emailVerifiedAt: "2026-02-12T10:00:00.000Z",
      now
    });

    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: ownerId,
        supabase_user_id: supabaseUserId,
        email: "owner@example.com",
        email_verified_at: "2026-02-12T10:00:00.000Z",
        created_at: now.toISOString()
      })
    );
    expect(result.owner_id).toBe(ownerId);
  });

  it("touches owner auth link on login", async () => {
    const query: any = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          link_id: "33333333-3333-4333-8333-333333333333",
          owner_id: ownerId,
          supabase_user_id: supabaseUserId,
          last_login_at: "2026-02-12T12:00:00.000Z"
        },
        error: null
      })
    };
    fromMock.mockReturnValue(query);

    const now = new Date("2026-02-12T12:00:00.000Z");
    const result = await touchOwnerLinkLogin({
      supabaseUserId,
      email: "owner@example.com",
      emailVerifiedAt: "2026-02-12T10:00:00.000Z",
      now
    });

    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@example.com",
        email_verified_at: "2026-02-12T10:00:00.000Z",
        last_login_at: now.toISOString()
      })
    );
    expect(query.eq).toHaveBeenCalledWith("auth_provider", "supabase");
    expect(query.eq).toHaveBeenCalledWith("auth_subject", supabaseUserId);
    expect(result?.owner_id).toBe(ownerId);
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
