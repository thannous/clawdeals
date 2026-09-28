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
