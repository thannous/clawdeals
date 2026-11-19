import type { APIRequestContext, APIResponse } from "@playwright/test";

import { canonicalJsonStringify } from "../../../src/server/utils/canonical-json";
import { hmacSha256 } from "../../../src/server/utils/hmac";

import { randomId } from "./ids";

export function randomTrackingNumber() {
  return `PC${randomId().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
}

export async function registerShipment(
  api: APIRequestContext,
  apiKey: string,
  escrowId: string,
  { carrier, trackingNumber }: { carrier: string; trackingNumber: string }
): Promise<APIResponse> {
  return api.post(`/api/v1/escrows/${encodeURIComponent(escrowId)}/shipment`, {
    headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
    data: { carrier, tracking_number: trackingNumber }
  });
}

// Posts a mock carrier event, signed the way the mock tracking provider signs it.
export async function postTrackingEvent(
  api: APIRequestContext,
  event: { carrier: string; trackingNumber: string; status: string; id?: string; location?: string },
  options: { signature?: string } = {}
): Promise<APIResponse> {
  const body = {
    id: event.id || `trk_${randomId()}`,
    carrier: event.carrier,
    tracking_number: event.trackingNumber,
    status: event.status,
    occurred_at: new Date().toISOString(),
    ...(event.location ? { location: event.location } : {})
  };
  const signature =
    options.signature ?? hmacSha256(process.env.TRACKING_WEBHOOK_SECRET as string, canonicalJsonStringify(body));
  return api.post("/api/v1/tracking/webhooks", {
    headers: { "x-tracking-signature": signature },
    data: body
  });
}

export async function getProtectedCheckout(api: APIRequestContext, apiKey: string, escrowId: string): Promise<APIResponse> {
  return api.get(`/api/v1/escrows/${encodeURIComponent(escrowId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
}
