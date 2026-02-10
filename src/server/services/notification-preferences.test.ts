import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("./owners", () => ({
  ensureOwnerExists: vi.fn(async () => {})
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { ensureOwnerExists } from "./owners";
import { getOrCreateNotificationPreferences, updateNotificationPreferences } from "./notification-preferences";

function makeClient() {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn()
  };
  const client: any = {
    from: vi.fn(() => builder)
  };
  return { client, builder };
}

describe("notification-preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates defaults when missing", async () => {
    const { client, builder } = makeClient();
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    builder.single.mockResolvedValueOnce({
      data: { owner_id: "o1", channel_type: "telegram", mode: "DIGEST_HOURLY" },
      error: null
    });

    const prefs = await getOrCreateNotificationPreferences({ ownerId: "o1", channelIdentityId: "cid-1", now: new Date("2026-02-10T00:00:00Z") });

    expect(ensureOwnerExists).toHaveBeenCalledWith("o1");
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ owner_id: "o1", channel_identity_id: "cid-1" }));
    expect(prefs.mode).toBe("DIGEST_HOURLY");
  });

  it("validates timezone and filters on update", async () => {
    const { client, builder } = makeClient();
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    builder.maybeSingle.mockResolvedValueOnce({
      data: { owner_id: "o1", timezone: "UTC", filters: {} },
      error: null
    });

    const prefs = await updateNotificationPreferences({
      ownerId: "o1",
      now: new Date("2026-02-10T00:00:00Z"),
      patch: {
        timezone: "Europe/Paris",
        filters: { strong: { max_price_eur: 120, min_seller_trust_score: 80 } }
      }
    });

    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      timezone: "Europe/Paris",
      filters: { strong: { max_price_eur: 120, min_seller_trust_score: 80 } }
    }));
    expect(prefs.timezone).toBe("UTC"); // from mocked response
  });

  it("rejects invalid timezone", async () => {
    const { client } = makeClient();
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    await expect(
      updateNotificationPreferences({
        ownerId: "o1",
        patch: { timezone: "Not/A_Timezone" }
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });
});

