import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencyMocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn(),
  getOwner: vi.fn(),
  getOwnerByEmail: vi.fn(),
  setOwnerVerified: vi.fn(),
  createAgent: vi.fn(),
  createWatchlist: vi.fn(),
  enqueueWatchlistBackfill: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: dependencyMocks.getSupabaseServiceClient
}));

vi.mock("./owners", () => ({
  getOwner: dependencyMocks.getOwner,
  getOwnerByEmail: dependencyMocks.getOwnerByEmail,
  setOwnerVerified: dependencyMocks.setOwnerVerified
}));

vi.mock("./agents", () => ({
  createAgent: dependencyMocks.createAgent
}));

vi.mock("./watchlists", () => ({
  createWatchlist: dependencyMocks.createWatchlist
}));

vi.mock("./watchlist-backfill-queue", () => ({
  enqueueWatchlistBackfill: dependencyMocks.enqueueWatchlistBackfill
}));

import {
  buildAlertConfirmToken,
  confirmEmailAlert,
  createEmailAlert,
  verifyAlertConfirmToken
} from "./email-alerts";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const WATCHLIST_ID = "22222222-2222-4222-8222-222222222222";
const AGENT_ID = "33333333-3333-4333-8333-333333333333";

describe("email-alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ALERT_CONFIRM_SECRET = "test-alert-secret";
  });

  afterEach(() => {
    delete process.env.ALERT_CONFIRM_SECRET;
  });

  describe("confirm token", () => {
    it("round-trips and rejects tampering and expiry", () => {
      const expiresAtMs = Date.parse("2026-08-14T00:00:00.000Z");
      const token = buildAlertConfirmToken({ ownerId: OWNER_ID, watchlistId: WATCHLIST_ID, expiresAtMs });

      const verified = verifyAlertConfirmToken(token, { now: new Date("2026-08-10T00:00:00.000Z") });
      expect(verified).toEqual({ ownerId: OWNER_ID, watchlistId: WATCHLIST_ID });

      const [payload, sig] = token.split(".");
      expect(() => verifyAlertConfirmToken(`${payload}x.${sig}`, { now: new Date("2026-08-10T00:00:00.000Z") })).toThrow(
        expect.objectContaining({ code: "ALERT_TOKEN_INVALID" })
      );
      expect(() => verifyAlertConfirmToken(token, { now: new Date("2026-08-15T00:00:00.000Z") })).toThrow(
        expect.objectContaining({ code: "ALERT_TOKEN_EXPIRED", status: 410 })
      );
    });
  });

  describe("createEmailAlert", () => {
    function makeAgentLookupClient(agentRow: any | null) {
      const chain: any = {
        eq: () => chain,
        contains: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: agentRow, error: null })
      };
      return { from: vi.fn(() => ({ select: () => chain })) };
    }

    it("creates an inactive watchlist and emails a localized confirmation link", async () => {
      dependencyMocks.getOwnerByEmail.mockResolvedValue({ owner_id: OWNER_ID, email: "user@example.test" });
      dependencyMocks.getSupabaseServiceClient.mockReturnValue(makeAgentLookupClient({ id: AGENT_ID, owner_id: OWNER_ID }));
      dependencyMocks.createWatchlist.mockResolvedValue({ watchlist_id: WATCHLIST_ID, active: false });
      const sendEmail = vi.fn(async () => ({ ok: true }));

      const result = await createEmailAlert({
        email: "user@example.test",
        locale: "fr",
        marketCode: "FR",
        currency: "EUR",
        criteria: { query: "vélo" },
        queryText: "vélo",
        tags: [],
        priceMax: 150,
        sendEmail
      });

      expect(result.status).toBe("pending_confirmation");
      expect(result.watchlist_id).toBe(WATCHLIST_ID);
      expect(dependencyMocks.createAgent).not.toHaveBeenCalled();
      expect(dependencyMocks.createWatchlist).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: AGENT_ID, active: false, marketCode: "FR", currency: "EUR" })
      );

      expect(sendEmail).toHaveBeenCalledOnce();
      const [mail] = sendEmail.mock.calls[0] as any[];
      expect(mail.toEmail).toBe("user@example.test");
      expect(mail.subject).toContain("Confirmez");
      expect(mail.text).toContain("/api/v1/alerts/confirm?token=");
      expect(mail.text).toContain("150 EUR");
    });

    it("creates the shadow alert agent when the owner has none", async () => {
      dependencyMocks.getOwnerByEmail.mockResolvedValue({ owner_id: OWNER_ID, email: "user@example.test" });
      dependencyMocks.getSupabaseServiceClient.mockReturnValue(makeAgentLookupClient(null));
      dependencyMocks.createAgent.mockResolvedValue({ id: AGENT_ID, owner_id: OWNER_ID });
      dependencyMocks.createWatchlist.mockResolvedValue({ watchlist_id: WATCHLIST_ID, active: false });

      await createEmailAlert({
        email: "user@example.test",
        marketCode: "GB",
        currency: "GBP",
        criteria: {},
        queryText: "gpu",
        sendEmail: vi.fn(async () => ({ ok: true }))
      });

      expect(dependencyMocks.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: OWNER_ID, metadata: { system: "email_alerts" } })
      );
    });

    it("returns the confirm URL instead of failing when no provider is configured outside production", async () => {
      dependencyMocks.getOwnerByEmail.mockResolvedValue({ owner_id: OWNER_ID, email: "user@example.test" });
      dependencyMocks.getSupabaseServiceClient.mockReturnValue(makeAgentLookupClient({ id: AGENT_ID, owner_id: OWNER_ID }));
      dependencyMocks.createWatchlist.mockResolvedValue({ watchlist_id: WATCHLIST_ID, active: false });
      const sendEmail = vi.fn(async () => ({ ok: false, skipped: true, error: "EMAIL_PROVIDER_NOT_CONFIGURED" }));

      const result = await createEmailAlert({
        email: "user@example.test",
        marketCode: "FR",
        currency: "EUR",
        criteria: {},
        queryText: "ps5",
        sendEmail
      });

      expect(result.email_delivery).toBe("skipped");
      expect(result.confirm_url).toContain("/api/v1/alerts/confirm?token=");
    });

    it("fails with 503 when the provider send fails", async () => {
      dependencyMocks.getOwnerByEmail.mockResolvedValue({ owner_id: OWNER_ID, email: "user@example.test" });
      dependencyMocks.getSupabaseServiceClient.mockReturnValue(makeAgentLookupClient({ id: AGENT_ID, owner_id: OWNER_ID }));
      dependencyMocks.createWatchlist.mockResolvedValue({ watchlist_id: WATCHLIST_ID, active: false });

      await expect(
        createEmailAlert({
          email: "user@example.test",
          marketCode: "FR",
          currency: "EUR",
          criteria: {},
          sendEmail: vi.fn(async () => ({ ok: false, status: 500, error: "HTTP 500" }))
        })
      ).rejects.toMatchObject({ status: 503, code: "EMAIL_SEND_FAILED" });
    });
  });

  describe("confirmEmailAlert", () => {
    function makeConfirmClient({
      watchlist,
      agent,
      onWatchlistUpdate
    }: {
      watchlist: any | null;
      agent: any | null;
      onWatchlistUpdate?: (patch: any) => void;
    }) {
      return {
        from: vi.fn((table: string) => {
          if (table === "watchlists") {
            return {
              select: () => {
                const chain: any = {
                  eq: () => chain,
                  is: () => chain,
                  maybeSingle: async () => ({ data: watchlist, error: null })
                };
                return chain;
              },
              update: (patch: any) => ({
                eq: async () => {
                  onWatchlistUpdate?.(patch);
                  return { error: null };
                }
              })
            };
          }
          if (table === "agents") {
            const chain: any = {
              eq: () => chain,
              maybeSingle: async () => ({ data: agent, error: null })
            };
            return { select: () => chain };
          }
          throw new Error(`unexpected table ${table}`);
        })
      };
    }

    it("activates the watchlist, verifies the owner email, and enqueues a backfill", async () => {
      const updates: any[] = [];
      dependencyMocks.getSupabaseServiceClient.mockReturnValue(
        makeConfirmClient({
          watchlist: { watchlist_id: WATCHLIST_ID, agent_id: AGENT_ID, active: false },
          agent: { id: AGENT_ID, owner_id: OWNER_ID },
          onWatchlistUpdate: (patch) => updates.push(patch)
        })
      );
      dependencyMocks.getOwner.mockResolvedValue({ owner_id: OWNER_ID, email_verified_at: null });
      dependencyMocks.setOwnerVerified.mockResolvedValue({});
      dependencyMocks.enqueueWatchlistBackfill.mockResolvedValue({});

      const token = buildAlertConfirmToken({
        ownerId: OWNER_ID,
        watchlistId: WATCHLIST_ID,
        expiresAtMs: Date.now() + 60_000
      });
      const result = await confirmEmailAlert({ token });

      expect(result).toEqual({ status: "confirmed", watchlist_id: WATCHLIST_ID });
      expect(updates[0]).toMatchObject({ active: true });
      expect(dependencyMocks.setOwnerVerified).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: OWNER_ID, type: "EMAIL" })
      );
      expect(dependencyMocks.enqueueWatchlistBackfill).toHaveBeenCalledWith({ watchlistId: WATCHLIST_ID });
    });

    it("rejects a token whose owner does not match the watchlist agent", async () => {
      dependencyMocks.getSupabaseServiceClient.mockReturnValue(
        makeConfirmClient({
          watchlist: { watchlist_id: WATCHLIST_ID, agent_id: AGENT_ID, active: false },
          agent: { id: AGENT_ID, owner_id: "99999999-9999-4999-8999-999999999999" }
        })
      );

      const token = buildAlertConfirmToken({
        ownerId: OWNER_ID,
        watchlistId: WATCHLIST_ID,
        expiresAtMs: Date.now() + 60_000
      });

      await expect(confirmEmailAlert({ token })).rejects.toMatchObject({
        status: 400,
        code: "ALERT_TOKEN_INVALID"
      });
      expect(dependencyMocks.setOwnerVerified).not.toHaveBeenCalled();
    });
  });
});
