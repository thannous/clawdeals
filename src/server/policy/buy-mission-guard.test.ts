import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/watchlists", () => ({ getWatchlistForAgent: vi.fn() }));

import { getWatchlistForAgent } from "../services/watchlists";
import { enforceBuyMissionOffer } from "./buy-mission-guard";

const NOW = new Date("2026-08-26T10:00:00.000Z");
const MISSION_ID = "11111111-1111-4111-8111-111111111111";
const AGENT_ID = "22222222-2222-4222-8222-222222222222";

function watchlist(overrides: Record<string, unknown> = {}) {
  return {
    watchlist_id: MISSION_ID,
    agent_id: AGENT_ID,
    active: true,
    criteria: {
      mission: {
        version: 1,
        kind: "BUY",
        preferred_price_max: 1200,
        hard_budget_max: 1300,
        currency: "EUR",
        requirements: ["battery_health >= 80%"],
        autonomous_actions: ["search", "ask_question", "make_offer"],
        contact_reveal: "manual_bilateral_approval",
        expires_at: "2026-09-02T10:00:00.000Z",
        location: { label: "Paris", lat: 48.8566, lon: 2.3522, radius_km: 25 }
      }
    },
    ...overrides
  };
}

describe("enforceBuyMissionOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWatchlistForAgent).mockResolvedValue(watchlist() as any);
  });

  it("authorizes a delegated offer inside the hard budget", async () => {
    await expect(
      enforceBuyMissionOffer({
        missionId: MISSION_ID,
        agentId: AGENT_ID,
        amount: 1250,
        currency: "eur",
        now: NOW
      })
    ).resolves.toMatchObject({ mission: { hard_budget_max: 1300, currency: "EUR" } });
    expect(getWatchlistForAgent).toHaveBeenCalledWith({
      watchlistId: MISSION_ID,
      agentId: AGENT_ID
    });
  });

  it.each([
    ["hard budget", { amount: 1301, currency: "EUR" }, "hard_budget_exceeded"],
    ["currency", { amount: 1200, currency: "GBP" }, "currency_mismatch"]
  ])("requires owner approval when %s is outside mission policy", async (_label, input, reason) => {
    await expect(
      enforceBuyMissionOffer({
        missionId: MISSION_ID,
        agentId: AGENT_ID,
        amount: input.amount,
        currency: input.currency,
        now: NOW
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "APPROVAL_REQUIRED",
      details: { mission_id: MISSION_ID, reason, hard_budget_max: 1300, currency: "EUR" }
    });
  });

  it("requires approval when make_offer was not delegated", async () => {
    vi.mocked(getWatchlistForAgent).mockResolvedValue(
      watchlist({
        criteria: {
          mission: {
            ...watchlist().criteria.mission,
            autonomous_actions: ["search", "ask_question"]
          }
        }
      }) as any
    );

    await expect(
      enforceBuyMissionOffer({
        missionId: MISSION_ID,
        agentId: AGENT_ID,
        amount: 1200,
        currency: "EUR",
        now: NOW
      })
    ).rejects.toMatchObject({
      code: "APPROVAL_REQUIRED",
      details: { reason: "action_not_delegated" }
    });
  });

  it("rejects inactive and expired missions before mutation", async () => {
    vi.mocked(getWatchlistForAgent).mockResolvedValueOnce(watchlist({ active: false }) as any);
    await expect(
      enforceBuyMissionOffer({
        missionId: MISSION_ID,
        agentId: AGENT_ID,
        amount: 1200,
        currency: "EUR",
        now: NOW
      })
    ).rejects.toMatchObject({ code: "MISSION_NOT_ACTIVE" });

    vi.mocked(getWatchlistForAgent).mockResolvedValueOnce(
      watchlist({
        criteria: {
          mission: { ...watchlist().criteria.mission, expires_at: "2026-08-26T09:00:00.000Z" }
        }
      }) as any
    );
    await expect(
      enforceBuyMissionOffer({
        missionId: MISSION_ID,
        agentId: AGENT_ID,
        amount: 1200,
        currency: "EUR",
        now: NOW
      })
    ).rejects.toMatchObject({ code: "MISSION_EXPIRED" });
  });
});
