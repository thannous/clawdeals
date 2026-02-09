function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function toDate(value: any): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

function hoursSince(asOf: Date, at: Date) {
  return Math.max((asOf.getTime() - at.getTime()) / (1000 * 60 * 60), 0);
}

export type DealRankV1Input = {
  temperature?: number | null;
  activeAt?: string | Date | null;
  createdAt: string | Date;
  asOf: string | Date;
  duplicateRank?: number | null; // 1 for canonical, 2+ for duplicates
  hidden?: boolean | null;
};

// Ranking v1 (deals):
// rank_score = temperature_score + recency_score - 15*duplicate_index - hidden_penalty
// temperature_score: clamp(temperature ?? 50, 0..100)
// recency_score: 100 * 12 / (12 + age_hours) where age is from (active_at ?? created_at)
// hidden_penalty: 10000 when hidden=true
export function computeDealRankScoreV1(input: DealRankV1Input) {
  const asOf = toDate(input.asOf);
  const createdAt = toDate(input.createdAt);
  const activeAt = toDate(input.activeAt) ?? createdAt;
  if (!asOf || !createdAt || !activeAt) return null;

  const temperature = clamp(Number.isFinite(input.temperature as any) ? Number(input.temperature) : 50, 0, 100);
  const ageHours = hoursSince(asOf, activeAt);
  const recency = (100 * 12) / (12 + ageHours);
  const dupRankRaw = Number.isFinite(input.duplicateRank as any) ? Number(input.duplicateRank) : 1;
  const dupIndex = Math.max(Math.floor(dupRankRaw) - 1, 0);
  const hiddenPenalty = input.hidden ? 10000 : 0;

  return round6(temperature + recency - dupIndex * 15 - hiddenPenalty);
}

export type ListingRankV1Input = {
  createdAt: string | Date;
  asOf: string | Date;
  priceAmount?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  sellerTrustScore?: number | null; // 0..100
  sellerTrustFlags?: string[] | null;
  hidden?: boolean | null;
};

function hasAnyFlag(flags: string[], candidates: string[]) {
  for (const c of candidates) {
    if (flags.includes(c)) return true;
  }
  return false;
}

function computeListingTrustBonus({ trustScore, trustFlags }: { trustScore: number; trustFlags: string[] }) {
  if (hasAnyFlag(trustFlags, ["restricted", "suspended", "under_review"])) return -50;
  if (trustScore >= 80) return 20;
  if (trustScore >= 50) return 10;
  return 0;
}

function computePriceFitBonus({ priceAmount, priceMin, priceMax }: { priceAmount: number; priceMin: number | null; priceMax: number | null }) {
  if (priceMin == null || priceMax == null) return 0;
  if (!(priceMax > priceMin)) return 0;
  const center = (priceMin + priceMax) / 2;
  const span = Math.max((priceMax - priceMin) / 2, 1);
  const dist = Math.abs(priceAmount - center);
  const closeness = 1 - Math.min(dist / span, 1);
  return round6(10 * closeness);
}

// Ranking v1 (listings):
// rank_score = recency_score + trust_bonus + optional_price_fit_bonus - hidden_penalty
// recency_score: 100 * 24 / (24 + age_hours)
// trust_bonus bands: restricted/suspended/under_review => -50; score>=80 => +20; score>=50 => +10
// price_fit_bonus: only when both priceMin+priceMax provided and max>min, max 10
// hidden_penalty: 10000 when hidden=true
export function computeListingRankScoreV1(input: ListingRankV1Input) {
  const asOf = toDate(input.asOf);
  const createdAt = toDate(input.createdAt);
  if (!asOf || !createdAt) return null;

  const ageHours = hoursSince(asOf, createdAt);
  const recency = (100 * 24) / (24 + ageHours);

  const trustScore = clamp(Number.isFinite(input.sellerTrustScore as any) ? Number(input.sellerTrustScore) : 0, 0, 100);
  const trustFlags = Array.isArray(input.sellerTrustFlags) ? input.sellerTrustFlags.filter((f) => typeof f === "string") : [];
  const trustBonus = computeListingTrustBonus({ trustScore, trustFlags });

  const priceAmount = Number.isFinite(input.priceAmount as any) ? Number(input.priceAmount) : 0;
  const priceMin = Number.isFinite(input.priceMin as any) ? Number(input.priceMin) : null;
  const priceMax = Number.isFinite(input.priceMax as any) ? Number(input.priceMax) : null;
  const priceBonus = computePriceFitBonus({ priceAmount, priceMin, priceMax });

  const hiddenPenalty = input.hidden ? 10000 : 0;
  return round6(recency + trustBonus + priceBonus - hiddenPenalty);
}

export function compareByRankCreatedAtIdDesc<T extends { rank_score: number; created_at: string; id: string }>(a: T, b: T) {
  if (a.rank_score !== b.rank_score) return b.rank_score - a.rank_score;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
}

