const TRUST_BASE_SCORE = 10;
const TRUST_FORMULA_VERSION = 1;
const BASE_FLAG_ORDER = ["unverified_owner", "quarantined"];
const QUARANTINE_DAYS = 7;

function clampInt(value, min, max) {
  const clamped = Math.min(Math.max(value, min), max);
  return Math.trunc(clamped);
}

export function normalizeTrustFlags(flags) {
  if (!flags) return [];
  if (Array.isArray(flags)) {
    const seen = new Set();
    const normalized = [];
    for (const flag of flags) {
      if (!flag) continue;
      const value = String(flag).trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      normalized.push(value);
    }
    return normalized;
  }
  if (typeof flags === "string") {
    const value = flags.trim();
    return value ? [value] : [];
  }
  return [];
}

export function computeAgePoints(daysSinceCreated) {
  if (!Number.isFinite(daysSinceCreated) || daysSinceCreated <= 6) return 0;
  if (daysSinceCreated <= 29) return 5;
  if (daysSinceCreated <= 89) return 10;
  if (daysSinceCreated <= 179) return 15;
  return 20;
}

export function computeVerificationPoints({ emailVerified, phoneVerified }) {
  if (emailVerified && phoneVerified) return 20;
  if (phoneVerified) return 15;
  if (emailVerified) return 5;
  return 0;
}

export function computeTrustScoreV0({ daysSinceCreated, emailVerified, phoneVerified }) {
  const score =
    TRUST_BASE_SCORE +
    computeAgePoints(daysSinceCreated) +
    computeVerificationPoints({ emailVerified, phoneVerified });
  return clampInt(score, 0, 100);
}

export function computeTrustScoreV1Full({ daysSinceCreated, emailVerified, phoneVerified }) {
  return computeTrustScoreV0({ daysSinceCreated, emailVerified, phoneVerified });
}

export function computeTrustScore({
  daysSinceCreated,
  emailVerified,
  phoneVerified,
  useFull = false
}) {
  if (useFull) {
    return computeTrustScoreV1Full({ daysSinceCreated, emailVerified, phoneVerified });
  }
  return computeTrustScoreV0({ daysSinceCreated, emailVerified, phoneVerified });
}

export function computeBaseTrustFlags({ daysSinceCreated, emailVerified, phoneVerified }) {
  const flags = [];
  if (!emailVerified && !phoneVerified) flags.push("unverified_owner");
  if (Number.isFinite(daysSinceCreated) && daysSinceCreated < QUARANTINE_DAYS) {
    flags.push("quarantined");
  }
  return flags;
}

export function mergeTrustFlags({ existingFlags, baseFlags }) {
  const existing = normalizeTrustFlags(existingFlags);
  const base = normalizeTrustFlags(baseFlags);
  const baseSet = new Set(base);

  const preserved = existing.filter((flag) => !baseSet.has(flag) && !BASE_FLAG_ORDER.includes(flag));
  const orderedBase = BASE_FLAG_ORDER.filter((flag) => baseSet.has(flag));

  return normalizeTrustFlags([...orderedBase, ...preserved, ...base]);
}

export function areFlagsEqual(left, right) {
  const leftNorm = normalizeTrustFlags(left);
  const rightNorm = normalizeTrustFlags(right);
  if (leftNorm.length !== rightNorm.length) return false;
  for (let index = 0; index < leftNorm.length; index += 1) {
    if (leftNorm[index] !== rightNorm[index]) return false;
  }
  return true;
}

export { TRUST_BASE_SCORE, TRUST_FORMULA_VERSION, QUARANTINE_DAYS };
