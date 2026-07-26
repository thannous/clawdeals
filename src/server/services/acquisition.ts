import { getSupabaseServiceClient } from "../db/supabase";
import {
  ACQUISITION_CTA_LOCATIONS,
  PUBLIC_ACQUISITION_EVENT_NAMES,
  localeToMarketCode,
  normalizeAcquisitionId,
  normalizeLandingPath,
  resolveEventLocale,
  sanitizeAttributionValue,
  type AcquisitionCtaLocation,
  type PublicAcquisitionEventName
} from "../../shared/acquisition";

const TABLE = "acquisition_funnel_events";

function buildServiceError(message: string, status = 500, code = "ERROR") {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizePublicEventName(value: unknown): PublicAcquisitionEventName | null {
  if (typeof value !== "string") return null;
  return PUBLIC_ACQUISITION_EVENT_NAMES.includes(value as PublicAcquisitionEventName)
    ? (value as PublicAcquisitionEventName)
    : null;
}

function normalizeCtaLocation(value: unknown): AcquisitionCtaLocation | null {
  if (typeof value !== "string") return null;
  return ACQUISITION_CTA_LOCATIONS.includes(value as AcquisitionCtaLocation)
    ? (value as AcquisitionCtaLocation)
    : null;
}

export function parsePublicAcquisitionEvent(body: any) {
  const acquisitionId = normalizeAcquisitionId(body?.acquisition_id);
  if (!acquisitionId) {
    throw buildServiceError("acquisition_id must be a UUID", 400, "VALIDATION_ERROR");
  }

  const eventName = normalizePublicEventName(body?.event_name);
  if (!eventName) {
    throw buildServiceError("event_name is not allowed", 400, "VALIDATION_ERROR");
  }

  const landingPath = normalizeLandingPath(body?.landing_path);
  if (!landingPath) {
    throw buildServiceError("landing_path is invalid", 400, "VALIDATION_ERROR");
  }

  const locale = resolveEventLocale(body?.locale);
  const source = sanitizeAttributionValue(body?.source);
  const medium = sanitizeAttributionValue(body?.medium);
  if (!source || !medium) {
    throw buildServiceError("source and medium are required", 400, "VALIDATION_ERROR");
  }

  const campaign = sanitizeAttributionValue(body?.campaign);
  const referrerHost = sanitizeAttributionValue(body?.referrer_host, 255);
  const ctaLocation =
    eventName === "connect_cta_clicked"
      ? normalizeCtaLocation(body?.cta_location) || "other"
      : null;

  return {
    acquisition_id: acquisitionId,
    event_name: eventName,
    landing_path: landingPath,
    locale,
    market_code: localeToMarketCode(locale),
    source,
    medium,
    campaign,
    referrer_host: referrerHost,
    cta_location: ctaLocation
  };
}

export async function recordPublicAcquisitionEvent(event: ReturnType<typeof parsePublicAcquisitionEvent>, client?: any) {
  const supabase = client || getSupabaseServiceClient();
  const { error } = await supabase
    .from(TABLE)
    .upsert(event, {
      onConflict: "acquisition_id,event_name",
      ignoreDuplicates: true
    });

  if (error) {
    throw buildServiceError(`Failed to record acquisition event: ${error.message}`);
  }
}

async function resolveAcquisitionForAgent(agentId: string, client: any) {
  const { data, error } = await client
    .from("connect_sessions")
    .select("acquisition_id")
    .eq("agent_id", agentId)
    .not("acquisition_id", "is", null)
    .order("delivered_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw buildServiceError(`Failed to resolve acquisition session: ${error.message}`);
  }
  return normalizeAcquisitionId(data?.acquisition_id);
}

async function insertMilestone(row: Record<string, any>, client: any) {
  const { error } = await client
    .from(TABLE)
    .upsert(row, {
      onConflict: "acquisition_id,event_name",
      ignoreDuplicates: true
    });
  if (error) {
    throw buildServiceError(`Failed to record acquisition milestone: ${error.message}`);
  }
}

export async function recordAgentConnected({
  sessionId,
  agentId,
  occurredAt = new Date(),
  client
}: {
  sessionId: string;
  agentId: string;
  occurredAt?: Date;
  client?: any;
}) {
  const supabase = client || getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("connect_sessions")
    .select("acquisition_id")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) {
    throw buildServiceError(`Failed to resolve connect acquisition: ${error.message}`);
  }
  const acquisitionId = normalizeAcquisitionId(data?.acquisition_id);
  if (!acquisitionId) return { recorded: false };

  await insertMilestone({
    acquisition_id: acquisitionId,
    event_name: "agent_connected",
    occurred_at: occurredAt.toISOString(),
    connect_session_id: sessionId,
    agent_id: agentId
  }, supabase);
  return { recorded: true };
}

export async function recordAgentMilestone({
  eventName,
  agentId,
  watchlistId = null,
  watchlistMatchId = null,
  marketCode = null,
  occurredAt = new Date(),
  client
}: {
  eventName: "watchlist_created" | "first_match";
  agentId: string;
  watchlistId?: string | null;
  watchlistMatchId?: string | null;
  marketCode?: string | null;
  occurredAt?: Date;
  client?: any;
}) {
  const supabase = client || getSupabaseServiceClient();
  const acquisitionId = await resolveAcquisitionForAgent(agentId, supabase);
  if (!acquisitionId) return { recorded: false };

  await insertMilestone({
    acquisition_id: acquisitionId,
    event_name: eventName,
    occurred_at: occurredAt.toISOString(),
    agent_id: agentId,
    watchlist_id: watchlistId,
    watchlist_match_id: watchlistMatchId,
    market_code: marketCode
  }, supabase);
  return { recorded: true };
}

export async function recordFirstMatches({
  matches,
  occurredAt = new Date(),
  client
}: {
  matches: Array<{
    agentId: string;
    watchlistMatchId?: string | null;
    marketCode?: string | null;
  }>;
  occurredAt?: Date;
  client?: any;
}) {
  const supabase = client || getSupabaseServiceClient();
  const byAgent = new Map<string, {
    agentId: string;
    watchlistMatchId: string | null;
    marketCode: string | null;
  }>();
  for (const match of matches || []) {
    if (!match?.agentId || byAgent.has(match.agentId)) continue;
    byAgent.set(match.agentId, {
      agentId: match.agentId,
      watchlistMatchId: match.watchlistMatchId || null,
      marketCode: match.marketCode || null
    });
  }
  if (byAgent.size === 0) return { recorded: 0 };

  const { data, error } = await supabase
    .from("connect_sessions")
    .select("acquisition_id,agent_id,delivered_at")
    .in("agent_id", Array.from(byAgent.keys()))
    .not("acquisition_id", "is", null)
    .order("delivered_at", { ascending: false, nullsFirst: false });
  if (error) {
    throw buildServiceError(`Failed to resolve acquisition sessions: ${error.message}`);
  }

  const acquisitionByAgent = new Map<string, string>();
  for (const session of Array.isArray(data) ? data : []) {
    const agentId = typeof session?.agent_id === "string" ? session.agent_id : null;
    const acquisitionId = normalizeAcquisitionId(session?.acquisition_id);
    if (!agentId || !acquisitionId || acquisitionByAgent.has(agentId)) continue;
    acquisitionByAgent.set(agentId, acquisitionId);
  }

  const rows = Array.from(byAgent.values()).flatMap((match) => {
    const acquisitionId = acquisitionByAgent.get(match.agentId);
    if (!acquisitionId) return [];
    return [{
      acquisition_id: acquisitionId,
      event_name: "first_match",
      occurred_at: occurredAt.toISOString(),
      agent_id: match.agentId,
      watchlist_match_id: match.watchlistMatchId,
      market_code: match.marketCode
    }];
  });
  if (rows.length === 0) return { recorded: 0 };

  const { error: insertError } = await supabase
    .from(TABLE)
    .upsert(rows, {
      onConflict: "acquisition_id,event_name",
      ignoreDuplicates: true
    });
  if (insertError) {
    throw buildServiceError(`Failed to record first-match milestones: ${insertError.message}`);
  }
  return { recorded: rows.length };
}

export async function safeRecordAgentConnected(params: Parameters<typeof recordAgentConnected>[0]) {
  try {
    return await recordAgentConnected(params);
  } catch (error: any) {
    console.info("acquisition.agent_connected_tracking_failed", {
      session_id: params.sessionId,
      error: error?.message || String(error)
    });
    return { recorded: false };
  }
}

export async function safeRecordAgentMilestone(params: Parameters<typeof recordAgentMilestone>[0]) {
  try {
    return await recordAgentMilestone(params);
  } catch (error: any) {
    console.info(`acquisition.${params.eventName}_tracking_failed`, {
      agent_id: params.agentId,
      error: error?.message || String(error)
    });
    return { recorded: false };
  }
}

export async function safeRecordFirstMatches(params: Parameters<typeof recordFirstMatches>[0]) {
  try {
    return await recordFirstMatches(params);
  } catch (error: any) {
    console.info("acquisition.first_match_tracking_failed", {
      agent_count: params.matches?.length || 0,
      error: error?.message || String(error)
    });
    return { recorded: 0 };
  }
}
