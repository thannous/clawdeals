import { normalizeBuyMission } from "../utils/buy-missions";
import { getWatchlistForAgent } from "../services/watchlists";

function missionError(
  message: string,
  status: number,
  code: string,
  details: Record<string, unknown> = {}
) {
  return Object.assign(new Error(message), { status, code, details });
}

export async function enforceBuyMissionOffer({
  missionId,
  agentId,
  amount,
  currency,
  now = new Date()
}: {
  missionId: string;
  agentId: string;
  amount: number;
  currency: string;
  now?: Date;
}) {
  const watchlist = await getWatchlistForAgent({ watchlistId: missionId, agentId });
  if (!watchlist) {
    throw missionError("Buy mission not found", 404, "NOT_FOUND");
  }
  if (watchlist.active !== true) {
    throw missionError("Buy mission is not active", 409, "MISSION_NOT_ACTIVE", {
      mission_id: missionId
    });
  }

  let mission;
  try {
    mission = normalizeBuyMission(watchlist.criteria?.mission, { now });
  } catch (error: any) {
    const reason = String(error?.message || "invalid_mission");
    const expired = reason.includes("expires_at must be in the future");
    throw missionError(
      expired ? "Buy mission has expired" : "Buy mission is invalid",
      409,
      expired ? "MISSION_EXPIRED" : "MISSION_INVALID",
      { mission_id: missionId, reason }
    );
  }

  const normalizedCurrency = String(currency || "").trim().toUpperCase();
  let approvalReason: string | null = null;
  if (!mission.autonomous_actions.includes("make_offer")) {
    approvalReason = "action_not_delegated";
  } else if (normalizedCurrency !== mission.currency) {
    approvalReason = "currency_mismatch";
  } else if (amount > mission.hard_budget_max) {
    approvalReason = "hard_budget_exceeded";
  }

  if (approvalReason) {
    throw missionError("Owner approval required", 409, "APPROVAL_REQUIRED", {
      mission_id: missionId,
      reason: approvalReason,
      hard_budget_max: mission.hard_budget_max,
      currency: mission.currency
    });
  }

  return { watchlist, mission };
}
