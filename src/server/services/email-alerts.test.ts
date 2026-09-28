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
