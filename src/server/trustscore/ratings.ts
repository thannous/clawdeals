export const RATING_PRIOR_MEAN = 3;
export const RATING_PRIOR_STRENGTH = 3;
export const RATING_POINTS_CAP = 30;

// Anti-farming: ratings from auto-completed transactions have reduced impact.
export const AUTO_COMPLETED_RATING_WEIGHT = 0.5;

function clampInt(value: number, min: number, max: number) {
  const clamped = Math.min(Math.max(value, min), max);
  return Math.trunc(clamped);
}

export function computeRatingPoints({ avgRating, ratingCount }: { avgRating: number; ratingCount: number }) {
  const count = Number.isFinite(ratingCount) ? ratingCount : 0;
  const avg = Number.isFinite(avgRating) ? avgRating : 0;
  if (count <= 0) return 0;

  const priorMean = RATING_PRIOR_MEAN;
  const priorStrength = RATING_PRIOR_STRENGTH;

  const bayesAvg = (priorMean * priorStrength + avg * count) / (priorStrength + count);
  // <=3★ => 0, 5★ => 1
  const quality = Math.max(0, (bayesAvg - 3) / 2);
  const confidence = count / (count + priorStrength);

  const raw = RATING_POINTS_CAP * quality * confidence;
  return clampInt(Math.round(raw), 0, RATING_POINTS_CAP);
}

