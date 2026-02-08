import { AUTO_COMPLETED_RATING_WEIGHT } from "./ratings";

export type AgentRatingStats = {
  avgRating: number;
  ratingCount: number;
};

function toNumber(value: any) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getRatingStatsByRatedAgentId(client: any, agentIds: string[]): Promise<Record<string, AgentRatingStats>> {
  if (!Array.isArray(agentIds) || agentIds.length === 0) return {};

  const { data: ratings, error: ratingsError } = await client
    .from("ratings")
    .select("rated_agent_id, score, tx_id")
    .in("rated_agent_id", agentIds);

  if (ratingsError) {
    throw Object.assign(new Error(`Failed to fetch ratings: ${ratingsError.message}`), {
      status: 500,
      code: "DATABASE_ERROR"
    });
  }

  const rows = Array.isArray(ratings) ? ratings : [];
  if (rows.length === 0) return {};

  const txIds = Array.from(
    new Set(
      rows
        .map((r: any) => r?.tx_id)
        .filter((id: any) => typeof id === "string" && id)
    )
  );

  if (txIds.length === 0) return {};

  const { data: txs, error: txError } = await client
    .from("transactions")
    .select("tx_id, auto_completed, status")
    .in("tx_id", txIds);

  if (txError) {
    throw Object.assign(new Error(`Failed to fetch transactions for ratings: ${txError.message}`), {
      status: 500,
      code: "DATABASE_ERROR"
    });
  }

  const txById = new Map<string, any>();
  (Array.isArray(txs) ? txs : []).forEach((tx: any) => {
    if (tx?.tx_id) txById.set(tx.tx_id, tx);
  });

  const acc: Record<string, { sumWeight: number; sumWeightedScore: number }> = {};

  for (const row of rows) {
    const ratedAgentId = row?.rated_agent_id;
    const txId = row?.tx_id;
    if (typeof ratedAgentId !== "string" || !ratedAgentId) continue;
    if (typeof txId !== "string" || !txId) continue;

    const tx = txById.get(txId);
    if (!tx || tx.status !== "COMPLETED") continue;

    const score = toNumber(row?.score);
    if (score === null) continue;

    const weight = tx.auto_completed ? AUTO_COMPLETED_RATING_WEIGHT : 1;
    if (!acc[ratedAgentId]) {
      acc[ratedAgentId] = { sumWeight: 0, sumWeightedScore: 0 };
    }
    acc[ratedAgentId].sumWeight += weight;
    acc[ratedAgentId].sumWeightedScore += score * weight;
  }

  const out: Record<string, AgentRatingStats> = {};
  for (const [agentId, bucket] of Object.entries(acc)) {
    const count = bucket.sumWeight;
    if (count <= 0) continue;
    out[agentId] = {
      ratingCount: count,
      avgRating: bucket.sumWeightedScore / count
    };
  }

  return out;
}

