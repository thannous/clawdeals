// Rounded to roughly 1 km so public and third-party agent responses do not
// expose a seller's precise location.
export function roundPublicCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
