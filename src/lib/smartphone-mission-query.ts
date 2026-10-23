function words(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value.normalize("NFKC").toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) || [];
}

/** The same lexical filter runs for catalogue pages and queued smartphone alerts.
 * It intentionally does not infer synonyms, model variants or compatibility. */
export function matchesSmartphoneMissionQuery(query: unknown, listing: { title?: unknown; description?: unknown }, model?: unknown): boolean {
  const required = words(query);
  if (!required.length) return false;
  const available = new Set([...words(listing.title), ...words(listing.description), ...words(model)]);
  return required.every(word => available.has(word));
}
