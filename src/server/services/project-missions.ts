import { createHash } from "node:crypto";
import { z } from "zod";
import { composeProjectPlan, inferProjectSlot, projectBriefSchema, projectFactsSchema, projectPickupExpired, type ProjectBrief, type ProjectCandidate, type ProjectFacts, type ProjectPlan, type ProjectSlot } from "../../shared/project-missions";
import { getSupabaseServiceClient } from "../db/supabase";
import { createAgentWithOwnerLimit, getAgentById, getAgentIdByOwnerId, getOwnerAgentLimit } from "./agents";
import { listListings } from "./listings";
import { getPolicyOrDefault } from "./policies";
import { evaluateAgentAccess } from "../policy/allowlist";
import { evaluatePolicyAction, POLICY_DECISION } from "../policy/evaluate";
import { redactMessageText } from "../messaging/redaction";
import { parseTypedMessage } from "../messaging/typed-message";
import { publishThreadEvent } from "./thread-events";
import { resolveTrustContext } from "../trustscore/context";
import { rateLimitMiddleware } from "../rate-limit/middleware";
import { projectContactSchema, projectMutationSchema, projectSelectionSchema } from "../http/project-missions";

export interface ProjectContactReceipt {
  seller_agent_id: string;
  version: number;
  configuration_id: string;
  thread_id: string;
  message_id: string;
  sent_at: string;
}
export interface OwnerProjectMission {
  id: string;
  owner_id: string;
  agent_id: string;
  version: number;
  brief: ProjectBrief;
  plan: ProjectPlan;
  selected_configuration_id: string | null;
  confirmed_version: number | null;
  confirmed_at: string | null;
  status: "DRAFT" | "SELECTED" | "CONFIRMED";
  contacts: ProjectContactReceipt[];
  created_at: string;
  updated_at: string;
}
type FactsMap = Record<string, { snapshot: Record<string, unknown>; facts: ProjectFacts }>;
type StoredMission = OwnerProjectMission & { facts: FactsMap; catalog_snapshots: Record<string, unknown>[]; creation_key: string };
const FIELDS = "listing_id,seller_agent_id,owner_id,title,description,category,price_amount,currency,market_code,status,updated_at,geo_lat,geo_lng,delivery_method";
const SEARCHES: { slot: ProjectSlot; queries: string[] }[] = [
  { slot: "desk", queries: ["bureau", "desk"] },
  { slot: "chair", queries: ["chaise", "fauteuil", "chair"] },
  { slot: "monitor", queries: ["écran", "moniteur", "monitor"] },
  { slot: "lamp", queries: ["lampe"] },
  { slot: "keyboard", queries: ["clavier"] }
];

function failure(message: string, status = 503, code = "PROJECT_MISSION_UNAVAILABLE", details?: unknown): never {
  throw Object.assign(new Error(message), { status, code, details });
}
function checked<T extends { error: any; data: any }>(result: T): T["data"] {
  if (result.error) failure("Project mission storage is unavailable");
  return result.data;
}
function sameJson(a: unknown, b: unknown) {
  const normalize = (value: any): any => Array.isArray(value) ? value.map(normalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
function mapMission(row: StoredMission): OwnerProjectMission {
  const { facts: _facts, catalog_snapshots: _snapshots, creation_key: _key, ...mission } = row;
  return { ...mission, contacts: (mission.contacts || []).map(({ content_key: _content, ...contact }: any) => contact) };
}
function distanceKm(lat: number, lon: number, listing: any): number | null {
  if (listing.geo_lat == null || listing.geo_lng == null) return null;
  const otherLat = Number(listing.geo_lat);
  const otherLon = Number(listing.geo_lng);
  if (!Number.isFinite(otherLat) || !Number.isFinite(otherLon)) return null;
  const rad = Math.PI / 180;
  const a = Math.sin((otherLat - lat) * rad / 2) ** 2 + Math.cos(lat * rad) * Math.cos(otherLat * rad) * Math.sin((otherLon - lon) * rad / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - Math.min(1, a)));
}

async function requireAgent(ownerId: string, existingId?: string): Promise<string> {
  let agentId = existingId || await getAgentIdByOwnerId(ownerId, { preferUnsuspended: true });
  if (!agentId) {
    try {
      agentId = (await createAgentWithOwnerLimit({ ownerId, ownerAgentLimit: getOwnerAgentLimit(), name: "ClawDeals", metadata: { created_via: "project_mission" } })).id;
    } catch (error: any) {
      if (error.code !== "OWNER_AGENT_LIMIT_REACHED") throw error;
      agentId = await getAgentIdByOwnerId(ownerId, { preferUnsuspended: true });
    }
  }
  if (!agentId) failure("No buyer agent is available", 409, "AGENT_UNAVAILABLE");
  const agent = await getAgentById(agentId);
  if (!agent || agent.owner_id !== ownerId) failure("Project mission not found", 404, "NOT_FOUND");
  if (agent.suspended_at) failure("Agent account is suspended", 403, "AGENT_SUSPENDED");
  return agentId;
}

async function loadCatalogue(brief: ProjectBrief, ownerId: string, facts: FactsMap) {
  const wanted = SEARCHES.filter(search => ["desk", "chair", "monitor", ...brief.optional_slots].includes(search.slot));
  const pages = await Promise.all(wanted.flatMap(search => search.queries.map(async q => ({
    slot: search.slot,
    result: await listListings({ q, priceMax: Math.ceil(brief.budget_cents / 100), sort: "distance", geo: { lat: brief.location.lat, lng: brief.location.lon, distanceKm: brief.location.radius_km }, limit: 30, includeHidden: false })
  }))));
  const slots = new Map<string, ProjectSlot>();
  for (const page of pages) for (const item of page.result.items) if (!slots.has(item.listing_id)) slots.set(item.listing_id, page.slot);
  const ids = [...slots.keys()];
  if (!ids.length) return { plan: composeProjectPlan(brief, []), snapshots: [] };
  const client = getSupabaseServiceClient();
  const listings = checked(await client.from("listings").select(FIELDS).in("listing_id", ids));
  const moderation = checked(await client.from("moderation_states").select("entity_id").eq("entity_type", "listing").in("entity_id", ids).eq("hidden", true));
  const hidden = new Set(moderation.map((row: any) => row.entity_id));
  const sellerIds = [...new Set(listings.map((listing: any) => listing.seller_agent_id))];
  const sellers = sellerIds.length ? checked(await client.from("agents").select("id,owner_id,suspended_at").in("id", sellerIds)) : [];
  const activeSellers = new Map<string,string>(sellers.filter((seller: any) => !seller.suspended_at && seller.owner_id !== ownerId).map((seller: any) => [seller.id,seller.owner_id]));
  const candidates: ProjectCandidate[] = [];
  const snapshots: Record<string, unknown>[] = [];
  for (const listing of listings) {
    if (hidden.has(listing.listing_id) || listing.status !== "LIVE" || listing.owner_id === ownerId || activeSellers.get(listing.seller_agent_id) !== listing.owner_id) continue;
    const price = Number(listing.price_amount);
    const distance = distanceKm(brief.location.lat, brief.location.lon, listing);
    if (listing.price_amount == null || !Number.isFinite(price) || price < 0 || listing.currency !== "EUR" || listing.market_code !== "FR" || distance === null || distance > brief.location.radius_km) continue;
    const saved = facts[listing.listing_id];
    // Search text includes description and overlapping phrases ("chaise de
    // bureau"). Only the actual item title determines its single project role.
    const slot = inferProjectSlot(listing.title, listing.category);
    if (!slot || !wanted.some(search => search.slot === slot)) continue;
    candidates.push({ listing_id: listing.listing_id, seller_agent_id: listing.seller_agent_id, title: listing.title, slot, price_cents: Math.round(price * 100), currency: listing.currency, market_code: listing.market_code, status: listing.status, updated_at: listing.updated_at, distance_km: distance, delivery_method: ["PICKUP", "SHIPPING", "BOTH"].includes(listing.delivery_method) ? listing.delivery_method : null, facts: saved && sameJson(saved.snapshot, listing) ? saved.facts : null });
    snapshots.push(listing);
  }
  // Bound broad multi-query results without letting a busy slot exhaust the
  // entire catalogue budget before the remaining required objects are sampled.
  const pools = wanted.map(search => candidates.filter(item => item.slot === search.slot).sort((a,b) => a.price_cents-b.price_cents || a.listing_id.localeCompare(b.listing_id)));
  const bounded: ProjectCandidate[] = [];
  for (let index=0; bounded.length<250 && pools.some(pool=>pool[index]); index++) {
    for (const pool of pools) if (pool[index] && bounded.length<250) bounded.push(pool[index]);
  }
  const included = new Set(bounded.map(item => item.listing_id));
  const plan = composeProjectPlan(brief, bounded);
  plan.search_limited ||= candidates.length > bounded.length || pages.some(page => Boolean(page.result.nextCursor));
  // Apply the same marketplace contact redaction before the user reviews the text.
  for (const configuration of plan.configurations) for (const group of configuration.seller_groups) {
    const parsed = parseTypedMessage({ type: "question", text: group.draft_message });
    if (!parsed.ok) failure("Project message does not fit the marketplace message contract");
    const redaction = redactMessageText((parsed.value.payload as { text: string }).text);
    group.draft_message = redaction.text;
    group.redacted = redaction.redacted;
  }
  plan.fingerprint = JSON.stringify([plan.fingerprint, plan.search_limited, plan.configurations.map(config => config.seller_groups)]);
  return { plan, snapshots: snapshots.filter(item => included.has(item.listing_id as string)) };
}

async function loadMission(ownerId: string, missionId: string): Promise<StoredMission> {
  const row = checked(await getSupabaseServiceClient().from("project_missions").select("*").eq("id", missionId).eq("owner_id", ownerId).maybeSingle());
  if (!row) failure("Project mission not found", 404, "NOT_FOUND");
  return row;
}

export async function listOwnerProjectMissions(ownerId: string) {
  const rows = checked(await getSupabaseServiceClient().from("project_missions").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(50));
  return { items: rows.map(mapMission) };
}

export async function createOwnerProjectMission(ownerId: string, body: unknown, creationKey: string) {
  const { brief } = z.object({ brief: projectBriefSchema }).strict().parse(body);
  const client = getSupabaseServiceClient();
  const existing = checked(await client.from("project_missions").select("*").eq("owner_id", ownerId).eq("creation_key", creationKey).maybeSingle());
  if (existing) {
    if (!sameJson(existing.brief, brief)) failure("Idempotency key belongs to another brief", 409, "IDEMPOTENCY_CONFLICT");
    return mapMission(existing);
  }
  // A persisted request remains recoverable with its original key after its
  // deadline, while a new expired brief must not provision or search anything.
  if (projectPickupExpired(brief)) failure("Choose a project deadline on or after today in France", 422, "PROJECT_DEADLINE_EXPIRED");
  const agentId = await requireAgent(ownerId);
  const { plan, snapshots } = await loadCatalogue(brief, ownerId, {});
  const result = await client.from("project_missions").insert({ owner_id: ownerId, agent_id: agentId, creation_key: creationKey, brief, plan, catalog_snapshots: snapshots }).select("*").single();
  if (result.error?.code === "23505") {
    const raced = checked(await client.from("project_missions").select("*").eq("owner_id", ownerId).eq("creation_key", creationKey).maybeSingle());
    if (raced && sameJson(raced.brief, brief)) return mapMission(raced);
    failure("Idempotency key belongs to another brief", 409, "IDEMPOTENCY_CONFLICT");
  }
  return mapMission(checked(result));
}

async function applyMission(row: StoredMission, action: string, current: Awaited<ReturnType<typeof loadCatalogue>>, options: { facts?: FactsMap; configurationId?: string; policies?: any[]; messages?: any[] } = {}) {
  const result = checked(await getSupabaseServiceClient().rpc("update_project_mission_v1", {
    p_owner_id: row.owner_id, p_mission_id: row.id, p_expected_version: row.version,
    p_action: action, p_plan: current.plan, p_snapshots: current.snapshots,
    p_facts: options.facts || row.facts, p_configuration_id: options.configurationId || null,
    p_policies: options.policies || [], p_messages: options.messages || []
  }));
  if (!result?.mission && !result?.error) failure("Project mission storage is unavailable");
  if (result.error) {
    const statuses: Record<string, number> = { NOT_FOUND: 404, AGENT_SUSPENDED: 403, OWNER_SUSPENDED: 403, SENDER_NOT_ALLOWED: 403, PLAN_INCOMPLETE: 422, PROJECT_DEADLINE_EXPIRED: 422, SELECTION_REQUIRED: 409, CATALOG_CHANGED: 409, VERSION_CONFLICT: 409, POLICY_CHANGED: 409 };
    failure(result.error, statuses[result.error] || 409, result.error, result.mission ? { mission: mapMission(result.mission) } : undefined);
  }
  return result as { mission: StoredMission; sent_messages?: any[] };
}

export async function getOwnerProjectMission(ownerId: string, missionId: string) {
  const row = await loadMission(ownerId, missionId);
  const current = await loadCatalogue(row.brief, ownerId, row.facts);
  if (row.plan.fingerprint === current.plan.fingerprint) return mapMission(row);
  try { return mapMission((await applyMission(row, "refresh", current)).mission); }
  catch (error: any) {
    if (error.code === "VERSION_CONFLICT") return mapMission(await loadMission(ownerId, missionId));
    throw error;
  }
}

export async function listProjectConversations(ownerId: string, missionId: string) {
  const mission = await loadMission(ownerId, missionId);
  const ids = [...new Set(mission.contacts.map(contact => contact.thread_id))].slice(-10);
  if (!ids.length) return { items: [] };
  const threads = checked(await getSupabaseServiceClient().from("threads").select("thread_id,listing_id,seller_agent_id")
    .eq("buyer_agent_id", mission.agent_id).eq("thread_type", "MARKETPLACE").in("thread_id", ids));
  const items = await Promise.all(threads.map(async (thread: any) => {
    // listMessages serves oldest-first pagination. This project view needs the
    // most recent answers, with a bounded query rather than an unbounded scan.
    const messages = checked(await getSupabaseServiceClient().from("messages").select("message_id,sender_type,sender_id,type,payload,redacted,created_at")
      .eq("thread_id", thread.thread_id).order("created_at", { ascending: false }).order("message_id", { ascending: false }).limit(20));
    return { seller_agent_id: thread.seller_agent_id, thread_id: thread.thread_id, listing_ids: [thread.listing_id], messages: messages.reverse().map((message: any) => ({
      message_id: message.message_id, sender_type: message.sender_type, sender_id: message.sender_id, type: message.type,
      payload: typeof message.payload?.text === "string" ? { type: message.type, text: redactMessageText(message.payload.text).text } : { type: message.type },
      redacted: Boolean(message.redacted), created_at: message.created_at
    })) };
  }));
  return { items };
}

const factsMutationSchema = projectMutationSchema.extend({ listing_id: z.string().uuid(), facts: projectFactsSchema }).strict();
export async function mutateOwnerProjectMission(ownerId: string, missionId: string, action: "recalculate" | "facts" | "select" | "confirm" | "contact", body: unknown, ctx?: any, req?: any) {
  const input = (action === "facts" ? factsMutationSchema : action === "contact" ? projectContactSchema : action === "select" || action === "confirm" ? projectSelectionSchema : projectMutationSchema).parse(body) as any;
  let row = await loadMission(ownerId, missionId);
  await requireAgent(ownerId, row.agent_id);
  if (row.version !== input.expected_version) failure("The project changed; review its current version", 409, "VERSION_CONFLICT", { mission: mapMission(row) });
  let current = await loadCatalogue(row.brief, ownerId, row.facts);
  if (action !== "recalculate" && row.plan.fingerprint !== current.plan.fingerprint) {
    row = (await applyMission(row, "refresh", current)).mission;
    failure("The catalogue changed; review the recalculated project", 409, "CATALOG_CHANGED", { mission: mapMission(row) });
  }
  if (action === "facts") {
    const snapshot = current.snapshots.find(item => item.listing_id === input.listing_id);
    if (!snapshot) failure("Listing is not in this project's current catalogue", 404, "NOT_FOUND");
    const facts = { ...row.facts, [input.listing_id]: { snapshot, facts: { ...input.facts, confirmed_at: new Date().toISOString(), provenance: "user_confirmed" as const } } };
    current = await loadCatalogue(row.brief, ownerId, facts);
    return mapMission((await applyMission(row, "facts", current, { facts })).mission);
  }
  if (action !== "contact") return mapMission((await applyMission(row, action === "recalculate" ? "refresh" : action, current, { configurationId: input.configuration_id })).mission);
  const config = current.plan.configurations.find(item => item.id === input.configuration_id);
  if (!config || row.selected_configuration_id !== config.id) failure("Select the current configuration before sending its messages", 409, "SELECTION_REQUIRED");
  const policies: any[] = [];
  const messages: any[] = [];
  if (ctx) {
    ctx.agentId = row.agent_id;
    await resolveTrustContext({ ctx, actionType: "message.send" });
  }
  for (const group of config.seller_groups) {
    const snapshot = current.snapshots.find(item => item.listing_id === group.listing_ids[0]);
    const sellerOwnerId = snapshot?.owner_id as string;
    if (!sellerOwnerId || sellerOwnerId === ownerId) failure("Seller is unavailable", 409, "CATALOG_CHANGED");
    const rawPolicy = checked(await getSupabaseServiceClient().from("policies").select("owner_id,version,policy_json").eq("owner_id", sellerOwnerId).maybeSingle());
    const policy = rawPolicy ? { ...rawPolicy.policy_json, version: rawPolicy.version } : (await getPolicyOrDefault(sellerOwnerId)).policy_json;
    if (!evaluateAgentAccess({ policy, agentId: row.agent_id }).allowed) failure("Seller does not permit this agent to contact them", 403, "SENDER_NOT_ALLOWED");
    if ([evaluatePolicyAction({ policy, action: "thread.create" }), evaluatePolicyAction({ policy, action: "message.send", messageType: "question" })].some(result => result.decision !== POLICY_DECISION.AUTO_APPROVED)) failure("Seller approval is required before contacting this seller", 403, "SELLER_APPROVAL_REQUIRED");
    policies.push({ owner_id: sellerOwnerId, snapshot: rawPolicy });
    const contentKey = createHash("sha256").update(JSON.stringify({ group, items: config.items.filter(item => item.seller_agent_id === group.seller_agent_id) })).digest("hex");
    messages.push({ seller_agent_id: group.seller_agent_id, listing_ids: group.listing_ids, text: group.draft_message, redacted: Boolean(group.redacted), content_key: contentKey });
    if (req) {
      for (const routeGroup of ["threads.create", "messages.send"]) {
        const limit = await rateLimitMiddleware(req, { routeGroup, agentId: row.agent_id, ownerId, ip: ctx?.ip, env: process.env, failOpen: false });
        if (limit && limit.status >= 400) failure("Messaging rate limit reached; retry later", limit.status, limit.body?.error?.code || "RATE_LIMITED");
      }
    }
  }
  const result = await applyMission(row, "contact", current, { configurationId: config.id, policies, messages });
  // Existing in-app events only; persistence and exact-once receipts commit together.
  for (const message of result.sent_messages || []) {
    try { await publishThreadEvent({ threadId: message.thread_id, type: message.redacted ? "message.redacted" : "message.sent", actor: { type: "agent", id: row.agent_id }, entity: { type: "message", id: message.message_id }, payload: { thread_id: message.thread_id, message } }); }
    catch { /* The conversation remains readable if live event publication fails. */ }
  }
  return mapMission(result.mission);
}
