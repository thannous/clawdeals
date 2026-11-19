import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

function buildError(message: string, status: number, code: string, details?: any) {
  return Object.assign(new Error(message), { status, code, ...(details ? { details } : {}) });
}

function throwMapped(error: any): never {
  const mapped = mapSupabaseError(error);
  throw buildError(mapped.message, mapped.status, mapped.code);
}

function throwShipmentRpcError(error: any): never {
  const message = String(error?.message || "");

  if (/ESCROW_NOT_FOUND/i.test(message)) {
    throw buildError("Escrow not found", 404, "ESCROW_NOT_FOUND");
  }
  if (/SHIPMENT_NOT_FOUND/i.test(message)) {
    throw buildError("Shipment not found", 404, "SHIPMENT_NOT_FOUND");
  }
  if (/SHIPMENT_ALREADY_REGISTERED/i.test(message)) {
    throw buildError("A different shipment is already registered for this escrow", 409, "SHIPMENT_ALREADY_REGISTERED");
  }
  if (/TRACKING_NUMBER_IN_USE/i.test(message)) {
    throw buildError("This tracking number is already registered", 409, "TRACKING_NUMBER_IN_USE");
  }
  const invalidState = /INVALID_STATE:([A-Z_]+)/i.exec(message);
  if (invalidState) {
    throw buildError("Invalid escrow state", 409, "INVALID_STATE", { status: invalidState[1].toUpperCase() });
  }
  const validation = /VALIDATION_ERROR:([A-Z_]+)/i.exec(message);
  if (validation) {
    throw buildError("Validation error", 400, "VALIDATION_ERROR", { field: validation[1].toLowerCase() });
  }
  throwMapped(error);
}

export async function registerShipment({
  escrowId,
  actorAgentId,
  carrier,
  trackingNumber
}: {
  escrowId: string;
  actorAgentId: string;
  carrier: string;
  trackingNumber: string;
}) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("escrow_register_shipment_v1", {
      p_escrow_id: escrowId,
      p_actor_agent_id: actorAgentId,
      p_carrier: carrier,
      p_tracking_number: trackingNumber
    })
    .single();
  if (error) throwShipmentRpcError(error);
  return data as any;
}

export async function recordTrackingEvent({
  carrier,
  trackingNumber,
  providerEventId,
  status,
  occurredAt,
  location
}: {
  carrier: string;
  trackingNumber: string;
  providerEventId: string;
  status: string;
  occurredAt: string;
  location?: string | null;
}) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("escrow_record_tracking_event_v1", {
      p_carrier: carrier,
      p_tracking_number: trackingNumber,
      p_provider_event_id: providerEventId,
      p_status: status,
      p_occurred_at: occurredAt,
      p_location: location ?? null
    })
    .single();
  if (error) throwShipmentRpcError(error);
  return data as any;
}

export async function claimInspectionExpiredEscrows({ limit }: { limit: number }) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.rpc("escrow_claim_inspection_expired_v1", { p_limit: limit });
  if (error) throwMapped(error);
  return Array.isArray(data) ? data : [];
}

export async function getTermsSnapshot(escrowId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("escrow_terms_snapshots")
    .select("escrow_id,listing_id,accepted_offer_id,terms,terms_sha256,captured_at")
    .eq("escrow_id", escrowId)
    .maybeSingle();
  if (error) throwMapped(error);
  return data || null;
}

export async function getShipmentWithEvents(escrowId: string) {
  const client = getSupabaseServiceClient();
  const { data: shipment, error } = await client
    .from("escrow_shipments")
    .select("shipment_id,escrow_id,tracking_provider,carrier,tracking_number,status,carrier_delivered_at,created_at")
    .eq("escrow_id", escrowId)
    .maybeSingle();
  if (error) throwMapped(error);
  if (!shipment) return null;

  const { data: events, error: eventsError } = await client
    .from("escrow_tracking_events")
    .select("tracking_event_id,status,occurred_at,location,received_at")
    .eq("shipment_id", shipment.shipment_id)
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (eventsError) throwMapped(eventsError);

  return { ...shipment, events: events || [] };
}

export function buildInspectionView(escrow: any, now: Date = new Date()) {
  const endsAt = escrow?.inspection_ends_at || null;
  const endsMs = endsAt ? Date.parse(endsAt) : NaN;
  return {
    window_hours: escrow?.inspection_window_hours ?? null,
    started_at: endsAt ? escrow?.delivered_at || null : null,
    ends_at: endsAt,
    // Open only while the escrow is still DELIVERED: a dispute, a confirmation
    // or the automatic release each end it.
    open: escrow?.status === "DELIVERED" && Number.isFinite(endsMs) && endsMs > now.getTime(),
    expired_at: escrow?.inspection_expired_at || null
  };
}

// Which side(s) of the escrow the caller acts for. An agent key acts for that
// agent only; an owner session acts for the agents the owner holds.
export async function resolveEscrowParties({
  escrow,
  agentId,
  ownerId
}: {
  escrow: any;
  agentId: string | null;
  ownerId: string | null;
}): Promise<{ buyer: boolean; seller: boolean }> {
  if (!escrow) return { buyer: false, seller: false };

  if (agentId) {
    return { buyer: agentId === escrow.buyer_agent_id, seller: agentId === escrow.seller_agent_id };
  }
  if (!ownerId) return { buyer: false, seller: false };

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("agents")
    .select("id,owner_id")
    .in("id", [escrow.buyer_agent_id, escrow.seller_agent_id]);
  if (error) throwMapped(error);

  const owned = new Set((data || []).filter((row: any) => row.owner_id === ownerId).map((row: any) => row.id));
  return { buyer: owned.has(escrow.buyer_agent_id), seller: owned.has(escrow.seller_agent_id) };
}

export async function getDisputeForEscrow(escrowId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("disputes").select("*").eq("escrow_id", escrowId).maybeSingle();
  if (error) throwMapped(error);
  return data || null;
}

export async function listDisputeStatements(disputeId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("dispute_statements")
    .select("submitted_by,body_redacted,created_at,updated_at")
    .eq("dispute_id", disputeId)
    .order("created_at", { ascending: true });
  if (error) throwMapped(error);
  return data || [];
}

export async function submitDisputeStatement({
  disputeId,
  submittedBy,
  bodyRedacted
}: {
  disputeId: string;
  submittedBy: "BUYER" | "SELLER";
  bodyRedacted: string;
}) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("dispute_submit_statement_v1", {
      p_dispute_id: disputeId,
      p_submitted_by: submittedBy,
      p_body_redacted: bodyRedacted
    })
    .single();
  if (error) {
    const message = String(error?.message || "");
    if (/DISPUTE_NOT_FOUND/i.test(message)) throw buildError("Not found", 404, "NOT_FOUND");
    if (/DISPUTE_ALREADY_RESOLVED/i.test(message)) {
      throw buildError("Dispute already resolved", 409, "DISPUTE_ALREADY_RESOLVED");
    }
    if (/VALIDATION_ERROR/i.test(message)) throw buildError("statement is invalid", 400, "VALIDATION_ERROR");
    throwMapped(error);
  }
  return data as any;
}

function buildDisputeView(dispute: any, statements: any[]) {
  if (!dispute) return null;
  return {
    dispute_id: dispute.dispute_id,
    status: dispute.status,
    opened_by: dispute.opened_by,
    reason_code: dispute.reason_code,
    opened_notes: dispute.opened_notes_redacted || null,
    opened_at: dispute.opened_at,
    resolution: dispute.resolution,
    resolution_notes: dispute.resolution_notes_redacted || null,
    resolved_at: dispute.resolved_at || null,
    statements: statements.map((row: any) => ({
      submitted_by: row.submitted_by,
      body: row.body_redacted,
      created_at: row.created_at,
      updated_at: row.updated_at
    }))
  };
}

function buildTermsView(snapshot: any) {
  if (!snapshot) return null;
  return {
    captured_at: snapshot.captured_at,
    sha256: snapshot.terms_sha256,
    listing: snapshot.terms?.listing || null,
    offer: snapshot.terms?.offer || null,
    payment: snapshot.terms?.payment || null,
    inspection_window_hours: snapshot.terms?.inspection_window_hours ?? null
  };
}

function buildShipmentView(shipment: any) {
  if (!shipment) return null;
  return {
    shipment_id: shipment.shipment_id,
    tracking_provider: shipment.tracking_provider,
    carrier: shipment.carrier,
    tracking_number: shipment.tracking_number,
    status: shipment.status,
    carrier_delivered_at: shipment.carrier_delivered_at || null,
    registered_at: shipment.created_at,
    events: (shipment.events || []).map((event: any) => ({
      tracking_event_id: event.tracking_event_id,
      status: event.status,
      occurred_at: event.occurred_at,
      location: event.location || null,
      received_at: event.received_at
    }))
  };
}

// Everything protected checkout knows about one escrow: the frozen terms, the
// inspection window, carrier tracking and the dispute with both statements.
export async function loadProtectedCheckout(escrow: any, now: Date = new Date()) {
  const [snapshot, shipment, dispute] = await Promise.all([
    getTermsSnapshot(escrow.escrow_id),
    getShipmentWithEvents(escrow.escrow_id),
    getDisputeForEscrow(escrow.escrow_id)
  ]);
  const statements = dispute ? await listDisputeStatements(dispute.dispute_id) : [];

  return {
    escrow: {
      escrow_id: escrow.escrow_id,
      tx_id: escrow.tx_id,
      status: escrow.status,
      currency: escrow.currency,
      amount_gross_minor: escrow.amount_gross_minor,
      amount_platform_fee_minor: escrow.amount_platform_fee_minor,
      amount_net_minor: escrow.amount_net_minor,
      created_at: escrow.created_at,
      delivered_at: escrow.delivered_at || null,
      confirmed_at: escrow.confirmed_at || null,
      released_at: escrow.released_at || null,
      refunded_at: escrow.refunded_at || null
    },
    terms: buildTermsView(snapshot),
    inspection: buildInspectionView(escrow, now),
    shipment: buildShipmentView(shipment),
    dispute: buildDisputeView(dispute, statements)
  };
}

export function buildPartyActions(view: any, parties: { buyer: boolean; seller: boolean }) {
  const status = view.escrow.status;
  const isParty = parties.buyer || parties.seller;
  const disputeActive = Boolean(view.dispute) && view.dispute.status !== "RESOLVED";
  return {
    register_shipment: parties.seller && status === "HOLD" && !view.shipment,
    mark_delivered: parties.seller && status === "HOLD" && !view.shipment,
    confirm_received: parties.buyer && status === "DELIVERED",
    open_dispute: isParty && !view.dispute && (status === "HOLD" || (status === "DELIVERED" && view.inspection.open)),
    submit_evidence: isParty && disputeActive,
    submit_statement: isParty && disputeActive
  };
}

const ESCROW_LIST_SELECT =
  "escrow_id,tx_id,buyer_agent_id,seller_agent_id,status,currency,amount_gross_minor,created_at,updated_at,delivered_at,inspection_window_hours,inspection_ends_at,inspection_expired_at";

async function attachListSummaries(escrows: any[], now: Date) {
  const ids = escrows.map((row: any) => row.escrow_id);
  if (ids.length === 0) return [];

  const client = getSupabaseServiceClient();
  const [snapshots, shipments, disputes] = await Promise.all([
    client.from("escrow_terms_snapshots").select("escrow_id,terms").in("escrow_id", ids),
    client.from("escrow_shipments").select("escrow_id,carrier,tracking_number,status").in("escrow_id", ids),
    client.from("disputes").select("escrow_id,dispute_id,status,opened_by,reason_code,opened_at,resolution").in("escrow_id", ids)
  ]);
  if (snapshots.error) throwMapped(snapshots.error);
  if (shipments.error) throwMapped(shipments.error);
  if (disputes.error) throwMapped(disputes.error);

  const byEscrow = (rows: any[] | null) => new Map((rows || []).map((row: any) => [row.escrow_id, row]));
  const snapshotMap = byEscrow(snapshots.data);
  const shipmentMap = byEscrow(shipments.data);
  const disputeMap = byEscrow(disputes.data);

  return escrows.map((row: any) => {
    const terms = snapshotMap.get(row.escrow_id)?.terms || null;
    const shipment = shipmentMap.get(row.escrow_id) || null;
    const dispute = disputeMap.get(row.escrow_id) || null;
    return {
      escrow_id: row.escrow_id,
      tx_id: row.tx_id,
      buyer_agent_id: row.buyer_agent_id,
      seller_agent_id: row.seller_agent_id,
      status: row.status,
      currency: row.currency,
      amount_gross_minor: row.amount_gross_minor,
      created_at: row.created_at,
      listing_title: terms?.listing?.title || null,
      inspection: buildInspectionView(row, now),
      shipment: shipment
        ? { carrier: shipment.carrier, tracking_number: shipment.tracking_number, status: shipment.status }
        : null,
      dispute: dispute
        ? {
            dispute_id: dispute.dispute_id,
            status: dispute.status,
            opened_by: dispute.opened_by,
            reason_code: dispute.reason_code,
            opened_at: dispute.opened_at,
            resolution: dispute.resolution
          }
        : null
    };
  });
}

export async function listProtectedCheckoutsForOwner({ ownerId, limit = 50 }: { ownerId: string; limit?: number }) {
  const client = getSupabaseServiceClient();
  const { data: agents, error: agentsError } = await client.from("agents").select("id").eq("owner_id", ownerId);
  if (agentsError) throwMapped(agentsError);

  const agentIds = (agents || []).map((row: any) => row.id);
  if (agentIds.length === 0) return [];

  const list = agentIds.join(",");
  const { data, error } = await client
    .from("escrows")
    .select(ESCROW_LIST_SELECT)
    .or(`buyer_agent_id.in.(${list}),seller_agent_id.in.(${list})`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throwMapped(error);

  const owned = new Set(agentIds);
  const items = await attachListSummaries(data || [], new Date());
  return items.map((item: any) => ({
    ...item,
    viewer_roles: [
      ...(owned.has(item.buyer_agent_id) ? ["BUYER"] : []),
      ...(owned.has(item.seller_agent_id) ? ["SELLER"] : [])
    ]
  }));
}

export async function listDisputesForReview({ status, limit = 50 }: { status?: string | null; limit?: number }) {
  const client = getSupabaseServiceClient();
  let query = client
    .from("disputes")
    .select("dispute_id,escrow_id,status,opened_by,reason_code,opened_at,resolution,resolved_at")
    .order("opened_at", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("status", status);

  const { data: disputes, error } = await query;
  if (error) throwMapped(error);
  if (!disputes || disputes.length === 0) return [];

  const escrowIds = disputes.map((row: any) => row.escrow_id);
  const { data: escrows, error: escrowsError } = await client.from("escrows").select(ESCROW_LIST_SELECT).in("escrow_id", escrowIds);
  if (escrowsError) throwMapped(escrowsError);

  const summaries = new Map((await attachListSummaries(escrows || [], new Date())).map((item: any) => [item.escrow_id, item]));
  return disputes.map((row: any) => {
    const summary: any = summaries.get(row.escrow_id) || null;
    return {
      dispute_id: row.dispute_id,
      escrow_id: row.escrow_id,
      status: row.status,
      opened_by: row.opened_by,
      reason_code: row.reason_code,
      opened_at: row.opened_at,
      resolution: row.resolution,
      resolved_at: row.resolved_at || null,
      escrow_status: summary?.status || null,
      listing_title: summary?.listing_title || null,
      currency: summary?.currency || null,
      amount_gross_minor: summary?.amount_gross_minor ?? null,
      shipment_status: summary?.shipment?.status || null
    };
  });
}
