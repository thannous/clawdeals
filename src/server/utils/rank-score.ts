export const DEAL_TREND_DECAY_HOURS = 12;
export const LISTING_RECENCY_DECAY_HOURS = 24;

// Standard surfaces should treat hidden items as excluded.
export const HIDDEN_RANK_SCORE = Number.NEGATIVE_INFINITY;

function toFiniteNumber(value: any, fallback: number) {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toMillis(value: any): number | null {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function hoursBetween(asOfMs: number, eventMs: number) {
  const deltaMs = asOfMs - eventMs;
  return deltaMs / 3600_000;
}

function round6(value: number) {
  // Match DB functions that round to 6 decimals for cursor stability.
  return Math.round(value * 1e6) / 1e6;
}

export type DuplicatePenaltyArgs = {
  groupSize?: number | null;
  isCanonical?: boolean | null;
};

// Explainable duplicate penalty: keep one canonical item at full weight,
// reduce subsequent duplicates by a factor that weakens as the group grows.
export function computeDuplicatePenaltyFactor({ groupSize, isCanonical }: DuplicatePenaltyArgs = {}) {
  const size = Math.trunc(toFiniteNumber(groupSize, 1));
  if (size <= 1) return 1;
  if (isCanonical) return 1;
  // groupSize=2 => ~0.707, groupSize=4 => 0.5
  return round6(1 / Math.sqrt(size));
}

export type ComputeDealTrendScoreArgs = {
  temperature?: number | string | null;
  activeAt: string | Date | number | null | undefined;
  asOf: string | Date | number;
  decayHours?: number;
};

export function computeDealTrendScore({
  temperature,
  activeAt,
  asOf,
  decayHours = DEAL_TREND_DECAY_HOURS
}: ComputeDealTrendScoreArgs) {
  const temp = clamp(toFiniteNumber(temperature, 50), 0, 100);

  const asOfMs = toMillis(asOf);
  const activeAtMs = toMillis(activeAt);
  if (!asOfMs || !activeAtMs) return 0;

  const ageHours = Math.max(hoursBetween(asOfMs, activeAtMs), 0);
  const d = toFiniteNumber(decayHours, DEAL_TREND_DECAY_HOURS);
  const denom = d + ageHours;
  if (!Number.isFinite(denom) || denom <= 0) return 0;

  return round6((temp * d) / denom);
}

export type ComputeDealRankScoreArgs = {
  hidden?: boolean | null;
  duplicateGroupSize?: number | null;
  duplicateIsCanonical?: boolean | null;
} & ComputeDealTrendScoreArgs;

export function computeDealRankScore({
  hidden,
  duplicateGroupSize,
  duplicateIsCanonical,
  ...trendArgs
}: ComputeDealRankScoreArgs) {
  if (hidden) return HIDDEN_RANK_SCORE;
  const base = computeDealTrendScore(trendArgs);
  const duplicatePenalty = computeDuplicatePenaltyFactor({ groupSize: duplicateGroupSize, isCanonical: duplicateIsCanonical });
  return round6(base * duplicatePenalty);
}

export type RankableDeal = {
  deal_id: string;
  created_at: string;
  active_at?: string | null;
  temperature?: number | null;
  hidden?: boolean | null;
  duplicate_group_size?: number | null;
  duplicate_is_canonical?: boolean | null;
};

export type CompareDealsByRankArgs = {
  asOf: string | Date | number;
};

export function compareDealsByRank(left: RankableDeal, right: RankableDeal, { asOf }: CompareDealsByRankArgs) {
  const lScore = computeDealRankScore({
    temperature: left.temperature,
    activeAt: left.active_at,
    asOf,
    hidden: left.hidden,
    duplicateGroupSize: left.duplicate_group_size,
    duplicateIsCanonical: left.duplicate_is_canonical
  });
  const rScore = computeDealRankScore({
    temperature: right.temperature,
    activeAt: right.active_at,
    asOf,
    hidden: right.hidden,
    duplicateGroupSize: right.duplicate_group_size,
    duplicateIsCanonical: right.duplicate_is_canonical
  });

  if (lScore !== rScore) return rScore - lScore;

  // Stable tie-breakers (TI-270): created_at desc, deal_id desc
  const lCreatedMs = toMillis(left.created_at) ?? 0;
  const rCreatedMs = toMillis(right.created_at) ?? 0;
  if (lCreatedMs !== rCreatedMs) return rCreatedMs - lCreatedMs;

  return String(right.deal_id).localeCompare(String(left.deal_id));
}

export function sortDealsByRank(deals: RankableDeal[], args: CompareDealsByRankArgs) {
  return [...deals].sort((a, b) => compareDealsByRank(a, b, args));
}

export type ComputeListingRankScoreArgs = {
  asOf: string | Date | number;
  createdAt: string | Date | number | null | undefined;
  hidden?: boolean | null;
  priceAmount?: number | string | null;
  priceTargetMax?: number | string | null;
  sellerTrustScore?: number | string | null;
  sellerTrustFlags?: string[] | string | null;
  duplicateGroupSize?: number | null;
  duplicateIsCanonical?: boolean | null;
  decayHours?: number;
};

export function computeListingRecencyScore({
  asOf,
  createdAt,
  decayHours = LISTING_RECENCY_DECAY_HOURS
}: {
  asOf: string | Date | number;
  createdAt: string | Date | number | null | undefined;
  decayHours?: number;
}) {
  const asOfMs = toMillis(asOf);
  const createdMs = toMillis(createdAt);
  if (!asOfMs || !createdMs) return 0;

  const ageHours = Math.max(hoursBetween(asOfMs, createdMs), 0);
  const d = toFiniteNumber(decayHours, LISTING_RECENCY_DECAY_HOURS);
  const denom = d + ageHours;
  if (!Number.isFinite(denom) || denom <= 0) return 0;
  return round6(d / denom);
}

export function computeSellerTrustMultiplier({
  sellerTrustScore,
  sellerTrustFlags
}: {
  sellerTrustScore?: number | string | null;
  sellerTrustFlags?: string[] | string | null;
}) {
  const score = clamp(toFiniteNumber(sellerTrustScore, 50), 0, 100);
  const flags =
    Array.isArray(sellerTrustFlags)
      ? sellerTrustFlags.map((f) => String(f || "").trim()).filter(Boolean)
      : typeof sellerTrustFlags === "string"
        ? [sellerTrustFlags.trim()].filter(Boolean)
        : [];
  const hasQuarantine = flags.includes("quarantined");

  // Banding keeps it explainable (and stable over small score movements).
  const band = score >= 70 ? 1.15 : score >= 40 ? 1.0 : 0.85;
  const quarantinePenalty = hasQuarantine ? 0.6 : 1.0;
  return round6(band * quarantinePenalty);
}

function computePriceFitBonus({
  priceAmount,
  priceTargetMax
}: {
  priceAmount?: number | string | null;
  priceTargetMax?: number | string | null;
}) {
  const price = toFiniteNumber(priceAmount, NaN);
  const max = toFiniteNumber(priceTargetMax, NaN);
  if (!Number.isFinite(price) || !Number.isFinite(max) || max <= 0) return 0;
  // Bonus for being under max; exact max yields 0 bonus, much cheaper yields up to +10.
  const fit = clamp((max - price) / max, 0, 1);
  return round6(fit * 10);
}

export function computeListingRankScore({
  asOf,
  createdAt,
  hidden,
  priceAmount,
  priceTargetMax,
  sellerTrustScore,
  sellerTrustFlags,
  duplicateGroupSize,
  duplicateIsCanonical,
  decayHours
}: ComputeListingRankScoreArgs) {
  if (hidden) return HIDDEN_RANK_SCORE;

  const recency = computeListingRecencyScore({ asOf, createdAt, decayHours });
  const trustMultiplier = computeSellerTrustMultiplier({ sellerTrustScore, sellerTrustFlags });
  const priceBonus = computePriceFitBonus({ priceAmount, priceTargetMax });
  const duplicatePenalty = computeDuplicatePenaltyFactor({ groupSize: duplicateGroupSize, isCanonical: duplicateIsCanonical });

  // Base scale ~[0..100] for readability; then apply multipliers/bonuses.
  const base = recency * 100;
  return round6((base * trustMultiplier + priceBonus) * duplicatePenalty);
}

export type RankableListing = {
  listing_id: string;
  created_at: string;
  price_amount?: number | null;
  hidden?: boolean | null;
  seller_trust_score?: number | null;
  seller_trust_flags?: string[] | string | null;
  duplicate_group_size?: number | null;
  duplicate_is_canonical?: boolean | null;
};

export type CompareListingsByRankArgs = {
  asOf: string | Date | number;
  priceTargetMax?: number | string | null;
};

export function compareListingsByRank(left: RankableListing, right: RankableListing, { asOf, priceTargetMax }: CompareListingsByRankArgs) {
  const lScore = computeListingRankScore({
    asOf,
    createdAt: left.created_at,
    hidden: left.hidden,
    priceAmount: left.price_amount,
    priceTargetMax,
    sellerTrustScore: left.seller_trust_score,
    sellerTrustFlags: left.seller_trust_flags,
    duplicateGroupSize: left.duplicate_group_size,
    duplicateIsCanonical: left.duplicate_is_canonical
  });
  const rScore = computeListingRankScore({
    asOf,
    createdAt: right.created_at,
    hidden: right.hidden,
    priceAmount: right.price_amount,
    priceTargetMax,
    sellerTrustScore: right.seller_trust_score,
    sellerTrustFlags: right.seller_trust_flags,
    duplicateGroupSize: right.duplicate_group_size,
    duplicateIsCanonical: right.duplicate_is_canonical
  });

  if (lScore !== rScore) return rScore - lScore;

  // Stable tie-breakers: created_at desc, listing_id desc
  const lCreatedMs = toMillis(left.created_at) ?? 0;
  const rCreatedMs = toMillis(right.created_at) ?? 0;
  if (lCreatedMs !== rCreatedMs) return rCreatedMs - lCreatedMs;

  return String(right.listing_id).localeCompare(String(left.listing_id));
}

export function sortListingsByRank(listings: RankableListing[], args: CompareListingsByRankArgs) {
  return [...listings].sort((a, b) => compareListingsByRank(a, b, args));
}
