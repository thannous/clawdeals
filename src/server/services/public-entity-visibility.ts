import { isSyntheticDealSource } from "../utils/synthetic-deal";

export async function visiblePublicEntityIds(client: any, entityType: "deal" | "listing", rows: any[]): Promise<Set<string>> {
  const idKey = entityType === "deal" ? "deal_id" : "listing_id";
  const eligible = rows.filter((row) => row?.[idKey] && (entityType === "listing"
    ? row.status === "LIVE"
    : ["NEW", "ACTIVE", "EXPIRED"].includes(row.status) && !isSyntheticDealSource(row.source_url)));
  const ids = [...new Set(eligible.map((row) => row[idKey]))];
  if (ids.length === 0) return new Set();
  const { data, error } = await client.from("moderation_states")
    .select("entity_id").eq("entity_type", entityType).in("entity_id", ids).eq("hidden", true);
  if (error || !Array.isArray(data)) {
    throw Object.assign(new Error("Entity visibility is unavailable"), { status: 503, code: "VISIBILITY_UNAVAILABLE" });
  }
  const hidden = new Set(data.map((row: any) => row.entity_id));
  return new Set(ids.filter((id) => !hidden.has(id)));
}
