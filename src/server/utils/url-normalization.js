import crypto from "crypto";

const TRACKING_PREFIXES = ["utm_", "mc_"];
const TRACKING_KEYS = new Set(["gclid", "fbclid"]);

function isTrackingParam(key) {
  const lower = key.toLowerCase();
  if (TRACKING_KEYS.has(lower)) return true;
  return TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function normalizeUrl(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const protocol = url.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return null;
  }

  url.protocol = protocol;
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  let pathname = url.pathname || "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.replace(/\/+$/, "");
    if (!pathname) pathname = "/";
  }
  url.pathname = pathname;

  const filtered = Array.from(url.searchParams.entries())
    .filter(([key]) => !isTrackingParam(key))
    .sort(([keyA, valueA], [keyB, valueB]) => {
      const keyCompare = keyA.localeCompare(keyB);
      if (keyCompare !== 0) return keyCompare;
      return valueA.localeCompare(valueB);
    });

  const normalizedParams = new URLSearchParams();
  filtered.forEach(([key, value]) => {
    normalizedParams.append(key, value);
  });

  const query = normalizedParams.toString();
  url.search = query ? `?${query}` : "";

  return url.toString();
}

export function fingerprintUrl(normalizedUrl) {
  if (typeof normalizedUrl !== "string" || !normalizedUrl) return null;
  return crypto.createHash("sha256").update(normalizedUrl).digest("hex");
}
