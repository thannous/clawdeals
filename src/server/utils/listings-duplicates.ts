import crypto from "crypto";

function normalizeTextForFingerprint(value: any) {
  if (typeof value !== "string") return "";
  const lowered = value.toLowerCase();
  // Keep it simple and deterministic: strip everything except a-z0-9 into spaces.
  const asciiish = lowered.replace(/[^a-z0-9]+/g, " ");
  return asciiish.replace(/\s+/g, " ").trim();
}

function computePriceBand(amount: number) {
  const n = Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0;
  const step = n < 100 ? 10 : n < 500 ? 25 : n < 2000 ? 50 : 100;
  const min = Math.floor(n / step) * step;
  const max = min + step - 1;
  return `${min}-${max}`;
}

function computeGeoBucket({ geoLat, geoLng }: { geoLat: any; geoLng: any }) {
  if (typeof geoLat !== "number" || !Number.isFinite(geoLat) || typeof geoLng !== "number" || !Number.isFinite(geoLng)) {
    return "none";
  }
  return `${geoLat.toFixed(2)},${geoLng.toFixed(2)}`;
}

export function computeListingDuplicateFingerprint({
  title,
  category,
  priceAmount,
  geoLat,
  geoLng
}: {
  title: string;
  category: string;
  priceAmount: number;
  geoLat: number | null;
  geoLng: number | null;
}) {
  const normalizedTitle = normalizeTextForFingerprint(title);
  const normalizedCategory = normalizeTextForFingerprint(category);
  const priceBand = computePriceBand(priceAmount);
  const geoBucket = computeGeoBucket({ geoLat, geoLng });

  const input = `${normalizedTitle}|${normalizedCategory}|${priceBand}|${geoBucket}`;
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export const __test = {
  normalizeTextForFingerprint,
  computePriceBand,
  computeGeoBucket
};

