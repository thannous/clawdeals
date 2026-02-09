import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { addAgentTrustFlag } from "./agents";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export function encodeReportCursor(cursor) {
  if (!cursor) return null;
  const payload = JSON.stringify({
    created_at: cursor.created_at,
    report_id: cursor.report_id
  });
  return Buffer.from(payload, "utf8").toString("base64");
}

export function decodeReportCursor(raw) {
  if (!raw || typeof raw !== "string") return null;
  let decoded;
  try {
    decoded = Buffer.from(raw, "base64").toString("utf8");
  } catch (error) {
    return { error: "Invalid cursor" };
  }
  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch (error) {
    return { error: "Invalid cursor" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { error: "Invalid cursor" };
  }
  if (typeof parsed.created_at !== "string" || typeof parsed.report_id !== "string") {
    return { error: "Invalid cursor" };
  }
  return {
    value: {
      created_at: parsed.created_at,
      report_id: parsed.report_id
    }
  };
}

function formatFilterValue(value) {
  if (typeof value !== "string") return String(value);
  return `"${value.replace(/"/g, "\\\"")}"`;
}

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

export async function listReports({ status, entityType, entityId, reporterOwnerId, reasonCode, limit, cursor }: any = {}) {
  const client = getSupabaseServiceClient();
  const pageLimit = limit ?? DEFAULT_LIMIT;
  let query = client
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .order("report_id", { ascending: false })
    .limit(pageLimit + 1);

  if (status) query = query.eq("status", status);
  if (entityType) query = query.eq("entity_type", entityType);
  if (entityId) query = query.eq("entity_id", entityId);
  if (reporterOwnerId) query = query.eq("reporter_owner_id", reporterOwnerId);
  if (reasonCode) query = query.eq("reason_code", reasonCode);

  if (cursor?.created_at && cursor?.report_id) {
    const createdAt = formatFilterValue(cursor.created_at);
    const reportId = formatFilterValue(cursor.report_id);
    query = query.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},report_id.lt.${reportId})`
    );
  }

  const { data, error } = await query;
  if (error) mapError(error);

  const reports = data || [];
  const hasMore = reports.length > pageLimit;
  const items = hasMore ? reports.slice(0, pageLimit) : reports;
  const nextCursor = hasMore
    ? encodeReportCursor({
        created_at: items[items.length - 1].created_at,
        report_id: items[items.length - 1].report_id
      })
    : null;

  return { reports: items, nextCursor };
}

export async function getReport(reportId) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("reports").select("*").eq("report_id", reportId).maybeSingle();
  if (error) mapError(error);
  return data || null;
}

async function applyReportPenalty(report) {
  const client = getSupabaseServiceClient();
  if (report.entity_type === "agent") {
    await addAgentTrustFlag(report.entity_id, "under_review");
    return;
  }
  const nowIso = new Date().toISOString();
  const payload = {
    entity_type: report.entity_type,
    entity_id: report.entity_id,
    hidden: true,
    hidden_at: nowIso,
    hidden_reason: "report_confirmed",
    hidden_by: "ops",
    updated_at: nowIso
  };
  const { error } = await client
    .from("moderation_states")
    .upsert(payload, { onConflict: "entity_type,entity_id" });
  if (error) {
    throw new Error(`Failed to upsert moderation state: ${error.message}`);
  }
}

async function maybeUnhideEntity(report) {
  const client = getSupabaseServiceClient();
  // Check if any other CONFIRMED reports exist for this entity
  const { data: confirmedReports, error: countError } = await client
    .from("reports")
    .select("report_id")
    .eq("entity_type", report.entity_type)
    .eq("entity_id", report.entity_id)
    .eq("status", "CONFIRMED")
    .neq("report_id", report.report_id)
    .limit(1);
  if (countError) return; // best-effort
  if (confirmedReports && confirmedReports.length > 0) return; // other confirmed reports exist

  // Only unhide if current hidden_reason is "report_threshold"
  const { data: modState } = await client
    .from("moderation_states")
    .select("hidden, hidden_reason")
    .eq("entity_type", report.entity_type)
    .eq("entity_id", report.entity_id)
    .maybeSingle();
  if (!modState || !modState.hidden || modState.hidden_reason !== "report_threshold") return;

  await client
    .from("moderation_states")
    .update({ hidden: false, updated_at: new Date().toISOString() })
    .eq("entity_type", report.entity_type)
    .eq("entity_id", report.entity_id);
}

export async function resolveReport({ reportId, action, reason, resolvedBy }) {
  const client = getSupabaseServiceClient();
  const newStatus = action === "confirm" ? "CONFIRMED" : "REJECTED";
  const nowIso = new Date().toISOString();

  const { data, error } = await client
    .from("reports")
    .update({
      status: newStatus,
      resolved_by: resolvedBy,
      resolved_at: nowIso,
      resolved_reason: reason || null
    })
    .eq("report_id", reportId)
    .eq("status", "UNCONFIRMED")
    .select("*")
    .maybeSingle();

  if (error) mapError(error);
  if (!data) {
    throw Object.assign(new Error("Report already resolved or not found"), { status: 409, code: "CONFLICT" });
  }

  if (action === "confirm") {
    await applyReportPenalty(data);
  } else {
    await maybeUnhideEntity(data);
  }

  return data;
}

export async function bulkResolveReports({ reportIds, action, reason, resolvedBy }) {
  const resolved = [];
  const skipped = [];

  for (const reportId of reportIds) {
    try {
      const report = await resolveReport({ reportId, action, reason, resolvedBy });
      resolved.push(report.report_id);
    } catch (err: any) {
      if (err.status === 409) {
        skipped.push(reportId);
      } else {
        throw err;
      }
    }
  }

  return { resolved, skipped };
}

export { MAX_LIMIT as REPORTS_MAX_LIMIT };
