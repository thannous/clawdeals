import crypto from "crypto";

const TRACKING_PARAM_PREFIXES = ["utm_", "mc_"];
const TRACKING_PARAM_KEYS = new Set(["gclid", "fbclid"]);
const DEAL_TEMPERATURE_K = 5.0;

function isTrackingParam(key) {
  const normalized = key.toLowerCase();
  if (TRACKING_PARAM_KEYS.has(normalized)) return true;
  return TRACKING_PARAM_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function normalizeDealUrl(value) {
  if (typeof value !== "string") {
    throw new Error("url must be a string");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("url must not be empty");
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch (error) {
    throw new Error("url must be a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("url must use http or https");
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  let pathname = url.pathname || "/";
  if (pathname.length > 1) {
    pathname = pathname.replace(/\/+$/g, "");
    if (!pathname) pathname = "/";
  }
  url.pathname = pathname;

  const entries = Array.from(url.searchParams.entries());
  url.search = "";
  const filtered = entries.filter(([key]) => !isTrackingParam(key));
  filtered
    .map(([key, val], index) => ({ key, val, index }))
    .sort((a, b) => {
      const cmp = a.key.localeCompare(b.key);
      return cmp !== 0 ? cmp : a.index - b.index;
    })
    .forEach(({ key, val }) => {
      url.searchParams.append(key, val);
    });

  return url.toString();
}

export function fingerprintUrl(normalizedUrl) {
  if (typeof normalizedUrl !== "string" || !normalizedUrl) {
    throw new Error("normalizedUrl must be a non-empty string");
  }
  return crypto.createHash("sha256").update(normalizedUrl).digest("hex");
}

export function calculateDealTemperature(weightedUp = 0, weightedDown = 0, k = DEAL_TEMPERATURE_K) {
  const wu = Number.isFinite(weightedUp) ? weightedUp : 0;
  const wd = Number.isFinite(weightedDown) ? weightedDown : 0;
  const smoothing = Number.isFinite(k) ? k : DEAL_TEMPERATURE_K;
  const denom = wu + wd + smoothing;
  if (!Number.isFinite(denom) || denom <= 0) {
    return 50;
  }
  const ratio = (wu - wd) / denom;
  return Math.round(50 + 50 * ratio);
}

export function normalizeTags(tags, options = {}) {
  if (tags === undefined || tags === null) return [];
  if (!Array.isArray(tags)) throw new Error("tags must be an array");

  const maxCount = options.maxCount ?? 10;
  const minLength = options.minLength ?? 1;
  const maxLength = options.maxLength ?? 32;
  const result = [];
  const seen = new Set();

  for (const entry of tags) {
    if (typeof entry !== "string") {
      throw new Error("tags must be strings");
    }
    const normalized = entry.trim().toLowerCase();
    if (!normalized) {
      throw new Error("tags must be non-empty");
    }
    if (normalized.length < minLength || normalized.length > maxLength) {
      throw new Error("tags must be 1..32 characters");
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length > maxCount) {
      throw new Error("too many tags");
    }
  }

  return result;
}
