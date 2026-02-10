import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../audit/singleton", () => ({
  safeAuditLog: vi.fn(async () => {})
}));

vi.mock("./notification-preferences", () => ({
  NOTIFICATION_EVENT_TYPES: ["watchlist_match", "offer_received", "approval_required", "transaction_updates"],
  getNotificationPreferences: vi.fn()
}));

import { getNotificationPreferences } from "./notification-preferences";
import { runNotificationsDispatch } from "./notifications-dispatch";

function makeClient({
  outboxRows,
  identity,
  deals = [],
  listings = [],
  agents = []
}: {
  outboxRows: any[];
  identity: any | null;
  deals?: any[];
  listings?: any[];
  agents?: any[];
}) {
  const outbox = outboxRows;
  const prefUpdates: any[] = [];

  function applyOutboxPatch(ids: string[], patch: any) {
    for (const row of outbox) {
      if (ids.includes(row.notification_outbox_id)) {
        Object.assign(row, patch);
      }
    }
  }

  const client: any = {
    _prefUpdates: prefUpdates,
    from(table: string) {
      if (table === "notification_outbox") {
        return {
          select() {
            const chain: any = {
              eq() {
                return chain;
              },
              order() {
                return chain;
              },
              limit() {
                return Promise.resolve({ data: outbox, error: null });
              }
            };
            return chain;
          },
          update(patch: any) {
            return {
              in(_col: string, ids: string[]) {
                applyOutboxPatch(ids, patch);
                return Promise.resolve({ error: null });
              }
            };
          }
        };
      }

      if (table === "channel_identities") {
        return {
          select() {
            const chain: any = {
              eq() {
                return chain;
              },
              order() {
                return chain;
              },
              limit() {
                return chain;
              },
              maybeSingle() {
                return Promise.resolve({ data: identity, error: null });
              }
            };
            return chain;
          }
        };
      }

      if (table === "deals") {
        return {
          select() {
            return {
              in(_col: string, ids: string[]) {
                const data = deals.filter((d) => ids.includes(d.deal_id));
                return Promise.resolve({ data, error: null });
              }
            };
          }
        };
      }

      if (table === "listings") {
        return {
          select() {
            return {
              in(_col: string, ids: string[]) {
                const data = listings.filter((l) => ids.includes(l.listing_id));
                return Promise.resolve({ data, error: null });
              }
            };
          }
        };
      }

      if (table === "agents") {
        return {
          select() {
            return {
              in(_col: string, ids: string[]) {
                const data = agents.filter((a) => ids.includes(a.id));
                return Promise.resolve({ data, error: null });
              }
            };
          }
        };
      }

      if (table === "notification_preferences") {
        return {
          update(patch: any) {
            return {
              eq(_col: string, ownerId: string) {
                prefUpdates.push({ ownerId, patch });
                return Promise.resolve({ error: null });
              }
            };
          }
        };
      }

      throw new Error(`unexpected table ${table}`);
    }
  };

  return client;
}

describe("notifications-dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends hourly digest (dry run) and marks outbox delivered", async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      owner_id: "o1",
      mode: "DIGEST_HOURLY",
      timezone: "UTC",
      quiet_enabled: false,
      quiet_start_min: null,
      quiet_end_min: null,
      event_types: ["watchlist_match"],
      filters: {},
      daily_digest_hour: 9,
      last_hourly_digest_at: null,
      last_daily_digest_at: null
    } as any);

    const outboxRows: any[] = [
      {
        notification_outbox_id: "n1",
        owner_id: "o1",
        channel_type: "telegram",
        event_type: "watchlist_match",
        entity_type: "deal",
        entity_id: "d1",
        payload: {},
        occurred_at: "2026-02-10T00:00:00.000Z",
        status: "PENDING",
        attempt_count: 0
      }
    ];

    const client = makeClient({
      outboxRows,
      identity: { channel_identity_id: "cid-1", channel_context_id: "chat-1" },
      deals: [{ deal_id: "d1", title: "Deal 1", price: 99.5, currency: "EUR" }]
    });

    const sendTelegram = vi.fn(async () => ({ ok: true }));

    const res = await runNotificationsDispatch({
      client,
      sendTelegram,
      dryRun: true,
      now: new Date("2026-02-10T10:00:00.000Z"),
      limitOwners: 1,
      maxItemsPerOwner: 10,
      maxItemsPerDigest: 10
    });

    expect(res.ok).toBe(true);
    expect(sendTelegram).not.toHaveBeenCalled();
    expect(outboxRows[0].status).toBe("DELIVERED");
    expect(outboxRows[0].delivered_at).toBe("2026-02-10T10:00:00.000Z");
    expect(client._prefUpdates.length).toBe(1);
    expect(client._prefUpdates[0].patch.last_hourly_digest_at).toBe("2026-02-10T10:00:00.000Z");
  });

  it("skips during quiet hours and keeps outbox pending", async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      owner_id: "o1",
      mode: "DIGEST_HOURLY",
      timezone: "UTC",
      quiet_enabled: true,
      quiet_start_min: 22 * 60,
      quiet_end_min: 8 * 60,
      event_types: ["watchlist_match"],
      filters: {},
      daily_digest_hour: 9,
      last_hourly_digest_at: null,
      last_daily_digest_at: null
    } as any);

    const outboxRows: any[] = [
      {
        notification_outbox_id: "n1",
        owner_id: "o1",
        channel_type: "telegram",
        event_type: "watchlist_match",
        entity_type: "deal",
        entity_id: "d1",
        payload: {},
        occurred_at: "2026-02-10T00:00:00.000Z",
        status: "PENDING",
        attempt_count: 0
      }
    ];

    const client = makeClient({
      outboxRows,
      identity: { channel_identity_id: "cid-1", channel_context_id: "chat-1" },
      deals: [{ deal_id: "d1", title: "Deal 1", price: 99.5, currency: "EUR" }]
    });

    const sendTelegram = vi.fn(async () => ({ ok: true }));

    const res = await runNotificationsDispatch({
      client,
      sendTelegram,
      dryRun: false,
      now: new Date("2026-02-10T23:00:00.000Z")
    });

    expect(res.ok).toBe(true);
    expect(sendTelegram).not.toHaveBeenCalled();
    expect(outboxRows[0].status).toBe("PENDING");
  });
});

