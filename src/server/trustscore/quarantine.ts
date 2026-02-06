import { normalizeTrustFlags } from "./compute";

const DAY_MS = 24 * 60 * 60 * 1000;
const QUARANTINE_DAYS = 7;
const INCIDENT_FLAGS = new Set(["under_review", "restricted", "suspended"]);

const QUARANTINE_MULTIPLIERS = {
  "deal.create": 0.5,
  "listing.create": 0.5,
  "thread.create": 0.35,
  "message.send": 0.35,
  "offer.create": 0.35,
  "report.create": 0.35,
  "deal.vote": 0.2,
  "policy.update": 1.0,
  "approval": 1.0
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function computeDaysSinceCreated(createdAt, now = new Date()) {
  if (!createdAt) return 0;
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;
  const diffMs = now.getTime() - created.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 0;
  return Math.floor(diffMs / DAY_MS);
}

export function isQuarantined({ daysSinceCreated = 0, trustFlags = [] } = {}) {
  if (Number.isFinite(daysSinceCreated) && daysSinceCreated < QUARANTINE_DAYS) {
    return true;
  }
  const flags = normalizeTrustFlags(trustFlags);
  return flags.some((flag) => INCIDENT_FLAGS.has(flag));
}

export function computeBaseWeight(trustScore) {
  const normalized = clamp(Number.isFinite(trustScore) ? trustScore : 0, 0, 100);
  const base = 0.25 + 0.75 * (normalized / 100);
  return clamp(base, 0.25, 1.0);
}

export function getQuarantineMultiplier(actionType) {
  if (!actionType) return 1.0;
  return QUARANTINE_MULTIPLIERS[actionType] ?? 1.0;
}

export function computeActionWeight({ trustScore, trustFlags, daysSinceCreated, actionType }) {
  const baseWeight = computeBaseWeight(trustScore);
  const quarantined = isQuarantined({ daysSinceCreated, trustFlags });
  const multiplier = quarantined ? getQuarantineMultiplier(actionType) : 1.0;
  return {
    actionWeight: baseWeight * multiplier,
    baseWeight,
    quarantineApplied: quarantined,
    quarantineMultiplier: multiplier
  };
}

export { QUARANTINE_DAYS, QUARANTINE_MULTIPLIERS, INCIDENT_FLAGS };
